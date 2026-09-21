import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

interface ValidatedRequestData {
    body?: unknown;
    query?: unknown;
    params?: unknown;
}

export function validate(schema: z.ZodType<ValidatedRequestData, any, any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        if (!result.success) {
            const errors = result.error.issues.map(err => ({
                field: err.path.slice(1).join('.'), // Remove 'body'/'query' prefix
                message: err.message,
            }));

            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: errors,
                },
            });
        }

        // Replace req properties with validated (and transformed) data
        if (result.data.body !== undefined) {
            req.body = result.data.body;
        }
        if (result.data.query !== undefined) {
            req.query = result.data.query as any;
        }
        if (result.data.params !== undefined) {
            req.params = result.data.params as any;
        }

        next();
    };
}
