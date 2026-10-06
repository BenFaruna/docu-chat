import { openaiBreaker } from '../lib/http/openai.breaker';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export async function generateEmbedding(
    text: string
): Promise<number[]> {
    const startTime = Date.now();

    const response = await openaiBreaker.fire('/embeddings', {
        input: text,
        model: EMBEDDING_MODEL,
    });

    const embedding = response.data.data[0].embedding;
    const duration = Date.now() - startTime;

    logger.info({
        model: EMBEDDING_MODEL,
        inputLength: text.length,
        dimensions: embedding.length,
        durationMs: duration,
        tokensUsed: response.data.usage?.total_tokens,
    }, 'Embedding generated');

    return embedding;
}

export async function generateEmbeddings(
    texts: string[]
): Promise<number[][]> {
    if (texts.length === 0) return [];

    // OpenAI supports up to 2048 inputs per request
    const BATCH_SIZE = 100; // Stay well under the limit
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);

        const response = await openaiBreaker.fire('/embeddings', {
            input: batch,
            model: EMBEDDING_MODEL,
        });

        // Sort by index to maintain order
        const sorted = response.data.data
            .sort((a: any, b: any) => a.index - b.index);

        for (const item of sorted) {
            allEmbeddings.push(item.embedding);
        }

        logger.info({
            batchIndex: Math.floor(i / BATCH_SIZE),
            batchSize: batch.length,
            totalTexts: texts.length,
            tokensUsed: response.data.usage?.total_tokens,
        }, 'Embedding batch processed');
    }

    return allEmbeddings;
}

export async function storeChunkEmbedding(
    chunkId: string,
    embedding: number[]
): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;

    await prisma.$executeRaw`
    UPDATE "Chunk"
    SET embedding = ${vectorStr}::vector
    WHERE id = ${chunkId}
  `;
}

export async function storeChunkEmbeddingsBatch(
    chunks: { id: string; embedding: number[] }[]
): Promise<void> {
    // Use a transaction for atomicity
    await prisma.$transaction(
        chunks.map(chunk => {
            const vectorStr = `[${chunk.embedding.join(',')}]`;
            return prisma.$executeRaw`
        UPDATE "Chunk"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${chunk.id}
      `;
        })
    );
}

