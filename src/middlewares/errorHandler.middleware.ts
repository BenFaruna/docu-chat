import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';

export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) {
    // Operational error: we created this intentionally
    if (err instanceof AppError) {
        console.warn(
            `[${err.code}] ${scrubSensitiveData(err.message)}`,
            err.details ? { details: scrubSensitiveData(err.details) } : ''
        );

        return res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.isOperational ? err.code : 500,
                Message: err.isOperational ? scrubSensitiveData(err.message) : "Internal server error",
                ...((err.details && err.isOperational) && { details: err.details }),
            },
        });
    }

    // Programming error: this is a bug
    console.error('Unhandled error:', scrubSensitiveData(err));

    return res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        },
    });
}

function scrubSensitiveData(data: any): any {
    if (typeof data !== 'string') return data;

    const patterns = [
        /Bearer [A-Za-z0-9\-._~+\/]+=*/g,  // JWT tokens
        /sk-[A-Za-z0-9]{20,}/g,              // OpenAI keys
        /password["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, // password in any format
    ];

    let scrubbed = data;
    for (const pattern of patterns) {
        scrubbed = scrubbed.replace(pattern, '[REDACTED]');
    }
    return scrubbed;
}
