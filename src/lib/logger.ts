import pino from 'pino';
import { config } from './config';

const isProduction = config.NODE_ENV === 'production';

export const logger = pino({
    level: isProduction ? 'info' : 'debug',
    base: { service: 'docuchat' },
    customLevels: { http: 35 },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label }),
    },
    ...(isProduction
        ? {}
        : {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            },
        }),
    redact: ['req.headers.authorization', 'password', '*.token'],
});
