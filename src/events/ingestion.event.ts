import { appEvents } from '../lib/events';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { documentsProcessed } from '../lib/metrics';
import { DOC_EVENTS } from './document.event';

appEvents.on(DOC_EVENTS.PROCESSED, async (data) => {
    try {
        await prisma.usageLog.create({
            data: {
                userId: data.userId,
                action: 'document_ingested',
                tokens: 0,
                costUsd: 0, // Will be updated by embedding events
                metadata: JSON.stringify({
                    documentId: data.documentId,
                    chunkCount: data.chunkCount,
                    durationMs: data.durationMs,
                    format: data.format,
                    pageCount: data.pageCount,
                }),
            },
        });

        // Update Prometheus metric
        documentsProcessed.inc({ status: 'success' });

        logger.info({
            documentId: data.documentId,
            chunkCount: data.chunkCount,
            correlationId: data.correlationId
        }, 'Ingestion logged');
    } catch (error) {
        documentsProcessed.inc({ status: 'failed' });

        logger.error({
            documentId: data.documentId,
            chunkCount: data.chunkCount,
            correlationId: data.correlationId
        }, 'Failed to log ingestion', error);
    }
});
