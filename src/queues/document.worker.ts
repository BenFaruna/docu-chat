import { Worker, Job } from 'bullmq';
import { redisConnection } from './connection';
import { prisma } from '../lib/prisma';
import { appEvents } from '../lib/events';
import { deadLetterQueue } from './deadLetter.queue';
import { logger } from '../lib/logger';
import { extractText, detectFormat } from '../lib/documentExtractor';
import { chunkDocument } from '../lib/chunker';
import {
    generateEmbeddingsBatchCached,
    storeChunkEmbeddingsBatch,
} from '../services/embedding.service';
import { DOC_EVENTS } from '../events/document.event';
import { chunksPerDocument, ingestionDuration } from '../lib/metrics';


const worker = new Worker(
    'document-processing',
    async (job: Job) => {
        const { documentId, userId, correlationId } = job.data;
        const startTime = Date.now();

        logger.info({
            correlationId, documentId, userId,
        }, 'Document processing started');

        await prisma.document.update({
            where: { id: documentId },
            data: { status: 'processing' },
        });

        try {
            // Step 1: Fetch document
            const doc = await prisma.document.findUniqueOrThrow({
                where: { id: documentId },
            });
            await job.updateProgress(5);

            // Step 2: Extract text
            const format = detectFormat(doc.filename);
            const { text, pageCount } = await extractText(doc.content, format);
            await job.updateProgress(15);

            logger.info({
                correlationId, documentId, format,
                textLength: text.length, pageCount,
            }, 'Text extracted');

            // Step 3: Chunk the text
            const chunks = chunkDocument(text, {
                maxTokens: 500,
                overlapTokens: 50,
                minChunkTokens: 50,
            });
            await job.updateProgress(30);

            logger.info({
                correlationId, documentId,
                chunkCount: chunks.length,
                avgTokens: Math.round(
                    chunks.reduce((sum, c) => sum + c.tokenEstimate, 0) / chunks.length
                ),
            }, 'Document chunked');

            // Step 4: Store chunks in database
            await prisma.$transaction(async (tx) => {
                await tx.chunk.deleteMany({ where: { documentId } });
                await tx.chunk.createMany({
                    data: chunks.map(chunk => ({
                        documentId,
                        index: chunk.index,
                        content: chunk.text,
                        tokenCount: chunk.tokenEstimate,
                    })),
                });
            });
            await job.updateProgress(50);

            // Step 5: Generate embeddings (the expensive step)
            const chunkTexts = chunks.map(c => c.text);
            const embeddings = await generateEmbeddingsBatchCached(chunkTexts);
            await job.updateProgress(85);

            // Step 6: Store embeddings
            const storedChunks = await prisma.chunk.findMany({
                where: { documentId },
                orderBy: { index: 'asc' },
                select: { id: true },
            });

            const embeddingsChunked = storedChunks.map((c, i) => ({
                id: c.id,
                embedding: embeddings[i] as number[]
            }));

            await storeChunkEmbeddingsBatch(embeddingsChunked);
            await job.updateProgress(95);

            // Step 7: Mark complete
            await prisma.document.update({
                where: { id: documentId },
                data: {
                    status: 'ready',
                    chunkCount: chunks.length,
                },
            });
            await job.updateProgress(100);

            const duration = Date.now() - startTime;

            ingestionDuration.observe({ format }, duration / 1000);
            chunksPerDocument.observe(chunks.length);

            // Emit completion event with metrics
            appEvents.emit(DOC_EVENTS.PROCESSED, {
                documentId,
                userId,
                correlationId,
                chunkCount: chunks.length,
                durationMs: duration,
                format,
                pageCount,
            });

            logger.info({
                correlationId, documentId,
                chunkCount: chunks.length, durationMs: duration,
            }, 'Document processing complete');

            return {
                success: true,
                chunks: chunks.length,
                durationMs: duration,
            };

        } catch (error) {
            if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
                await prisma.document.update({
                    where: { id: documentId },
                    data: {
                        status: 'failed',
                        error: (error as Error).message,
                    },
                });
            }

            logger.error({
                correlationId, documentId,
                error: (error as Error).message,
                attempt: job.attemptsMade + 1,
            }, 'Document processing failed');
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: 3,
    }
);


// Event listeners for logging
worker.on('completed', (job) => {
    logger.info({ job, chunks: job.returnvalue?.chunks, event: 'job:completed' }, `Job ${job.id} completed: ${job.returnvalue?.chunks} chunks`);
});

worker.on('failed', async (job, error) => {
    if (!job) return;

    // Check if all attempts exhausted
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
        logger.error({ job, err: error, event: 'job:failed' }, `Job ${job.id} permanently failed. Moving to DLQ.`);

        await deadLetterQueue.add('failed-document', {
            originalJobId: job.id,
            originalQueue: 'document-processing',
            data: job.data,
            error: error.message,
            failedAt: new Date().toISOString(),
            attempts: job.attemptsMade,
        });
    }

});

worker.on('error', (error) => {
    logger.error({ err: error, event: 'job:error' }, 'Worker error:');
});

export { worker };
