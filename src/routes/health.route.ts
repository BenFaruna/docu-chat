import { Router } from 'express';
import { getHealthLive, getHealthReady } from '../controllers/health.controler';

const router = Router();

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     description: |
 *       Indicates whether the application process is running and responsive.
 *       A non-2xx response (or connection failure) signals that the container
 *       should be restarted.
 *
 *       This endpoint is intentionally unauthenticated so that load-balancers
 *       and orchestrators (Kubernetes, ECS, etc.) can reach it without credentials.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-16T10:00:00.000Z"
 *       503:
 *         description: Service is unavailable (starting up or shutting down)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [error]
 *                   example: error
 */
router.get('/health/live', getHealthLive);

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: |
 *       Indicates whether the application is ready to serve traffic. Unlike the
 *       liveness probe this check also validates connectivity to downstream
 *       dependencies (database, Redis, etc.). A non-2xx response signals that
 *       the instance should temporarily be removed from the load-balancer rotation
 *       until dependencies recover.
 *
 *       This endpoint is intentionally unauthenticated.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is ready to accept traffic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 *                   example: ok
 *                 checks:
 *                   type: object
 *                   description: Individual dependency check results
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [ok, error]
 *                       example: ok
 *                     redis:
 *                       type: string
 *                       enum: [ok, error]
 *                       example: ok
 *       503:
 *         description: One or more dependencies are unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [error]
 *                   example: error
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: error
 *                     redis:
 *                       type: string
 *                       example: ok
 */
router.get('/health/ready', getHealthReady);

export default router;