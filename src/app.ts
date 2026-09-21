import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { logger } from './lib/logger';
import { config } from './lib/config';

import authRoutes from './routes/auth.route';

import './events/auth.event';

const app = express();

app.use(helmet());              // Security headers
app.use(cors());                // Cross-origin requests
app.use(express.json());        // Parse JSON request bodies

app.use('/api/auth', authRoutes)

// === REQUEST LOGGING ===
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info({
        method: req.method,
        url: req.url,
        ip: req.ip,
    });
    next();
});

// === HEALTH CHECK ===
app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
    });
});

export { app };
