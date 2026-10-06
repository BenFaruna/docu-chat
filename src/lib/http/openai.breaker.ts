import CircuitBreaker from 'opossum';
import { openaiClient } from './openai.client';
import { withRetry } from './retry';
import { logger } from '../logger';

async function callOpenAI(path: string, body: any) {
    return withRetry(() => openaiClient.post(path, body));
}

export const openaiBreaker = new CircuitBreaker(callOpenAI, {
    timeout: 35000,              // Slightly longer than the client timeout
    errorThresholdPercentage: 50, // Open if 50% of recent requests fail
    resetTimeout: 30000,          // Try again after 30 seconds
    rollingCountTimeout: 60000,   // Track failures over a 60-second window
    rollingCountBuckets: 10,
});

// Optional: fallback when the breaker is open
openaiBreaker.fallback(() => {
    throw new Error('OpenAI is temporarily unavailable. Please try again shortly.');
});

// Visibility into state changes
openaiBreaker.on('open', () =>
    logger.warn('⚠️  OpenAI circuit breaker OPENED — requests will fail fast'));
openaiBreaker.on('halfOpen', () =>
    logger.warn('⚠️  OpenAI circuit breaker HALF-OPEN — testing recovery'));
openaiBreaker.on('close', () =>
    logger.info('✅ OpenAI circuit breaker CLOSED — normal operation'));
