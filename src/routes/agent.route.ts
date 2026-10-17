import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/authorize.middleware';
import { chatLimiter } from '../middlewares/rateLimiter.middleware';
import { runAgent } from '../agents/executor';

const router = Router();
router.use(authenticate);

router.post('/research',
    chatLimiter,
    requirePermission('conversations:create'),
    async (req, res, next) => {
        try {
            const result = await runAgent({
                question: req.body.question,
                userId: req.user!.id,
                correlationId: (req as any).correlationId,
            });

            res.json({
                success: true,
                data: {
                    answer: result.answer,
                    sources: result.sources,
                    confidence: result.confidence,
                    metadata: {
                        iterations: result.iterations,
                        costUsd: result.totalCostUsd,
                        terminationReason: result.terminationReason,
                    },
                },
            });
        } catch (error) { next(error); }
    }
);

export default router;
