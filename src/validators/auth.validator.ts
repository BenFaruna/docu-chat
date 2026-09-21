import { z } from 'zod';

export const registerSchema = z.object({
    body: z.object({
        name: z.string().min(3, 'Name must be at least 3 characters'),
        email: z.email('Must be a valid email')
            .transform(v => v.toLowerCase().trim()),
        password: z.string()
            .min(8, 'Password must be at least 8 characters')
            .max(128, 'Password cannot exceed 128 characters')
            .regex(/[A-Z]/, 'Must contain an uppercase letter')
            .regex(/[0-9]/, 'Must contain a number'),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: z.email().transform(v => v.toLowerCase().trim()),
        password: z.string().min(1, 'Password is required'),
    }),
});

export const refreshSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
});
