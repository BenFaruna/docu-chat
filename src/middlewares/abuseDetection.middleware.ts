import type { Request, Response, NextFunction } from 'express';
import { cacheRedis } from '../lib/cache';
import { logger } from '../lib/logger';

export async function trackSuspiciousActivity(
    req: Request, res: Response, next: NextFunction
) {
    const userId = (req as any).user?.id;
    if (!userId) return next();

    // Track unique documents accessed in last 5 minutes
    if (req.path.match(/\/documents\/[\w-]+$/)) {
        const key = `access-pattern:${userId}`;
        const docId = req.params.id as string;

        if (docId) {
            await cacheRedis.sadd(key, docId);
            await cacheRedis.expire(key, 300);  // 5 minute window

            const uniqueDocs = await cacheRedis.scard(key);
            if (uniqueDocs > 50) {
                logger.warn(
                    {
                        userId, docId, uniqueDocs, ip: req.ip,
                        event: 'abuse-detection', correlationId: (req as any).correlationId
                    },
                    `Suspicious: user ${userId} accessed ${uniqueDocs} unique documents in 5 min`
                );
                // In production: emit event, alert admin, temporarily throttle
            }
        }
    }

    next();
}
