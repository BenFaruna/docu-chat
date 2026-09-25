import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test'])
        .default('development'),
    PORT: z.coerce.number().default(3000),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Authentication
    JWT_ACCESS_SECRET: z.string().min(32,
        'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32,
        'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

    OPENAI_API_KEY: z.string().optional(),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('\n❌ Invalid environment variables:');
    console.error(z.treeifyError(parsed.error));
    process.exit(1);
}

export const config = parsed.data;
