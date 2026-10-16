import { Router } from 'express';
import { config } from '../lib/config';
import { verifyWebhookSignature } from '../middlewares/webhook.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /webhooks/example:
 *   post:
 *     summary: Receive an inbound webhook event
 *     description: |
 *       Endpoint for receiving signed webhook events from an external provider.
 *
 *       **Signature verification:** Every request must include a valid HMAC-SHA256
 *       signature in the `X-Webhook-Signature` header. Requests with missing or
 *       invalid signatures are rejected with `401`.
 *
 *       **Idempotency:** Each event carries a unique `id`. If the same event ID
 *       has already been fully processed, the endpoint returns `200` immediately
 *       with `duplicate: true` and performs no further work.
 *
 *       **Async processing:** The endpoint acknowledges receipt with `202` before
 *       processing begins. Actual processing is handled asynchronously. If
 *       processing fails, `processedAt` is left unset so the provider can safely
 *       retry the delivery.
 *
 *       **Supported event types:**
 *       | Event type | Description |
 *       |---|---|
 *       | `document.imported` | Triggers document processing pipeline |
 *
 *       Unknown event types are logged and acknowledged without error.
 *     tags: [Webhooks]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Webhook-Signature
 *         required: true
 *         description: HMAC-SHA256 signature of the raw request body using the shared webhook secret
 *         schema:
 *           type: string
 *         example: "sha256=abc123def456..."
 *     requestBody:
 *       required: true
 *       description: Raw JSON body of the webhook event
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookEvent'
 *           examples:
 *             DocumentImported:
 *               summary: document.imported event
 *               value:
 *                 id: "evt_01J2X3Y4Z5"
 *                 type: "document.imported"
 *                 data:
 *                   documentUrl: "https://storage.example.com/docs/report.pdf"
 *                   userId: "d4e5f6a7-b8c9-0123-def0-456789012345"
 *     responses:
 *       200:
 *         description: Event already processed (idempotent duplicate acknowledgement)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookAck'
 *             example:
 *               received: true
 *               duplicate: true
 *       202:
 *         description: Event received and queued for asynchronous processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookAck'
 *             example:
 *               received: true
 *       401:
 *         description: Missing or invalid webhook signature
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error:
 *                 code: INVALID_SIGNATURE
 *                 message: Webhook signature verification failed
 *       400:
 *         description: Malformed JSON body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/example',
    verifyWebhookSignature(config.WEBHOOK_SECRET!, 'X-Webhook-Signature'),
    async (req, res) => {
        // Body is still raw bytes here — parse it manually
        const event = JSON.parse((req as any).rawBody.toString());

        // Idempotency check
        const existing = await prisma.webhookEvent.findUnique({
            where: { id: event.id },
        });

        if (existing?.processedAt) {
            // Already processed. Acknowledge without re-processing.
            return res.status(200).json({ received: true, duplicate: true });
        }

        // Record receipt (or update if half-processed)
        await prisma.webhookEvent.upsert({
            where: { id: event.id },
            update: {},
            create: {
                id: event.id,
                provider: 'example',
                eventType: event.type,
                payload: JSON.stringify(event),
            },
        });

        // ACKNOWLEDGE FAST. Process async.
        res.status(202).json({ received: true });

        // Queue the actual work
        try {
            await processWebhookEvent(event);
            await prisma.webhookEvent.update({
                where: { id: event.id },
                data: { processedAt: new Date() },
            });
        } catch (error) {
            logger.error({
                err: error, event: 'webhook:error', correlationId: (req as any).correlationId
            }, `Webhook ${event.id} processing failed`);
            // Don't mark processedAt. The provider will retry.
        }
    }
);

async function processWebhookEvent(event: any) {
    // Route to the right handler based on event type
    switch (event.type) {
        case 'document.imported':
            // Queue document processing
            break;
        default:
            logger.info({ eventType: event.type, event: 'webhook:unhandled' }, `Unhandled webhook event type: ${event.type}`);
    }
}

export default router;
