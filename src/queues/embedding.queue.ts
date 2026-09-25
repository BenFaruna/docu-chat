import { Queue } from 'bullmq';
import { redisConnection } from './connection';

export const embeddingQueue = new Queue('embedding-generation', {
    connection: redisConnection,
});

// In the worker, configure rate limiting:
import { Worker } from 'bullmq';
import { openaiBreaker } from '../lib/http/openai.breaker';

const worker = new Worker(
    'embedding-generation',
    async (job) => {
        // Call OpenAI through the breaker
        return openaiBreaker.fire('/embeddings', {
            input: job.data.text,
            model: 'text-embedding-3-small',
        });
    },
    {
        connection: redisConnection,
        concurrency: 5,
        limiter: {
            max: 100,        // Max 100 jobs
            duration: 60000, // Per 60 seconds
        },
    }
);
