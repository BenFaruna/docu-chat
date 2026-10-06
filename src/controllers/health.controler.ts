import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { cacheRedis } from '../lib/cache';

// Liveness: is the process running?
export const getHealthLive = (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
}

// Readiness: can the process handle requests?
export const getHealthReady = async (req: Request, res: Response) => {
    const checks: Record<string, any> = {};

    // Check database
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok' };
    } catch (error) {
        checks.database = {
            status: 'error',
            message: (error as Error).message,
        };
    }

    // Check Redis
    try {
        await cacheRedis.ping();
        checks.redis = { status: 'ok' };
    } catch (error) {
        checks.redis = {
            status: 'error',
            message: (error as Error).message,
        };
    }

    const allHealthy = Object.values(checks)
        .every(c => c.status === 'ok');

    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        checks,
    });
}

