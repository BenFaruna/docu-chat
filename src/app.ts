import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

import { logger } from './lib/logger';
import { config } from './lib/config';

import authRoutes from './routes/auth.route';
import adminRoutes from './routes/admin.route';
import { errorHandler } from './middlewares/errorHandler.middleware';

import './events/auth.event';
import './events/admin.event';

const app = express();

app.use(helmet());              // Security headers
app.use(cors());                // Cross-origin requests
app.use(express.json());        // Parse JSON request bodies

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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
});


app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/admin', adminRoutes)

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.path} not found` },
    });
});

app.use(errorHandler);

export { app };
