import axios, { type AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../logger';

export const openaiClient: AxiosInstance = axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 30000,
    headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DocuChat/1.0',
    },
});

openaiClient.interceptors.request.use((config) => {
    const startTime = Date.now();
    (config as any).metadata = { startTime };
    logger.info(`→ OpenAI ${config.method?.toUpperCase()} ${config.url}`);
    return config;
});

openaiClient.interceptors.response.use(
    (response) => {
        const startTime = (response.config as any).metadata?.startTime;
        const duration = startTime ? Date.now() - startTime : 0;
        const remaining = parseInt(
            response.headers['x-ratelimit-remaining-requests'] || '999'
        );

        if (remaining < 50) {
            logger.warn(`OpenAI rate limit getting low: ${remaining} remaining`);
        }

        logger.info(
            `← OpenAI ${response.status} ${response.config.url} (${duration}ms)`
        );
        return response;
    },
    (error) => {
        const startTime = error.config?.metadata?.startTime;
        const duration = startTime ? Date.now() - startTime : 0;

        if (error.response) {
            // Server responded with error status
            logger.error(
                {
                    err: error,
                    event: 'openai:error', data: error.response.data
                }, `✕ OpenAI ${error.response.status} ${error.config?.url} (${duration}ms):`
            );
        } else if (error.request) {
            // No response received (timeout, network error)
            logger.error(
                { err: error, event: 'openai:error' }, `✕ OpenAI no response ${error.config?.url} (${duration}ms):`
            );
        } else {
            logger.error({ err: error, event: 'openai:error' }, "✕ OpenAI request setup error");
        }

        return Promise.reject(error);
    }
);
