import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { bullBoardAdapter } from './config/bullBoard';

import { logger } from './lib/logger';
import { config } from './lib/config';

import authRoutes from './routes/auth.route';
import adminRoutes from './routes/admin.route';
import documentRoutes from './routes/document.route';

import { verifyWebhookSignature } from './middlewares/webhook.middleware';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { sanitizeInput } from './middlewares/sanitize.middleware';

import './events/auth.event';
import './events/admin.event';
import './events/cache.event';
import './events/document.event';
import './events/security.event';

import './queues/document.worker';
import { apiLimiter, authLimiter, uploadLimiter } from './middlewares/rateLimiter.middleware';

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            scriptSrc: ["'none'"],
            styleSrc: ["'none'"],
            imgSrc: ["'none'"],
            connectSrc: ["'self'"],
        },
    },
}
));              // Security headers

const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3001',
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,  // Allow cookies/auth headers
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Cache preflight requests for 24 hours
}));


const secret = config.WEBHOOK_SECRET!;
app.use('/webhooks', verifyWebhookSignature(secret, "x-signature"), express.raw({
    type: 'application/json',
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    },
}));

app.use((req, res, next) => {
    Object.defineProperty(req, 'query', {
        value: { ...req.query },
        writable: true,
        configurable: true,
        enumerable: true,
    });
    next();
});

app.use(express.json());        // Parse JSON request bodies
app.use(sanitizeInput);


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

app.use('/api-docs', helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
        },
    },
}), swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
});


app.use('/api/v1', apiLimiter)
app.use('/api/v1/auth', authLimiter, authRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/documents', uploadLimiter, documentRoutes)

// === QUEUE MONITOR ===
if (config.NODE_ENV === 'development') {
    app.use('/admin/queues', bullBoardAdapter.getRouter());
}


app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.path} not found` },
    });
});

app.use(errorHandler);

export { app };
