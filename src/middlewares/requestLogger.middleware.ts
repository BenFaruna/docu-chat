import { randomUUID } from 'crypto';

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function requestLogger(
    req: Request, res: Response, next: NextFunction
) {
    // Generate a unique correlation ID for this request
    const correlationId = req.headers['x-correlation-id'] as string
        || randomUUID();

    // Attach to the request so other code can use it
    (req as any).correlationId = correlationId;

    // Add it to the response headers so the client can reference it
    res.setHeader('X-Correlation-Id', correlationId);
    const log = logger.child({ correlationId });
    (req as any).log = log

    const startTime = Date.now();

    // Log the incoming request
    log.http({
        correlationId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
    }, 'Request received');

    // Log the response when it finishes
    res.on('finish', () => {
        const logData = {
            correlationId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - startTime,
            userId: (req as any).user?.id,
        };

        if (res.statusCode >= 500) {
            logger.error(logData, 'Request failed');
        } else if (res.statusCode >= 400) {
            logger.warn(logData, 'Request client error');
        } else {
            logger.info(logData, 'Request completed');
        }
    });

    next();
}
