import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
    createDocumentSchema,
    listDocumentsSchema,
    documentParamsSchema,
} from '../validators/document.validator';
import {
    createDocument,
    listDocuments,
    getDocument,
    deleteDocument,
    processingStatus,
} from '../controllers/document.controller';
import { requirePermission } from '../middlewares/authorize.middleware';
import { conditionalGet } from '../middlewares/etag.middleware';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: List the authenticated user's documents
 *     description: |
 *       Returns a paginated list of documents owned by the authenticated user.
 *       Supports filtering by processing status, free-text search on title, and
 *       sorting. Results include ETag-based caching support via `If-None-Match`.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         description: Page number (1-indexed)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         example: 1
 *       - in: query
 *         name: limit
 *         description: Number of results per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         example: 20
 *       - in: query
 *         name: status
 *         description: Filter by processing status
 *         schema:
 *           type: string
 *           enum: [pending, processing, ready, failed]
 *       - in: query
 *         name: search
 *         description: Full-text search on document title (max 200 chars)
 *         schema:
 *           type: string
 *           maxLength: 200
 *       - in: query
 *         name: sortBy
 *         description: Field to sort results by
 *         schema:
 *           type: string
 *           enum: [createdAt, title, chunkCount]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         description: Sort direction
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated list of documents
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Document'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/',
    authenticate,
    requirePermission("documents:read"),
    validate(listDocumentsSchema),
    conditionalGet(),
    listDocuments
);

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Upload and process a new document
 *     description: |
 *       Creates a new document record and enqueues it for asynchronous processing
 *       (chunking + embedding). The response is returned immediately with a `pending`
 *       status. Poll `GET /documents/{id}/processing-status` to track progress.
 *
 *       **Required permission:** `documents:create`
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDocumentRequest'
 *     responses:
 *       201:
 *         description: Document created successfully. Processing has been queued.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Document'
 *             example:
 *               success: true
 *               data:
 *                 id: "c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12"
 *                 title: "Annual Report 2025"
 *                 status: "pending"
 *                 chunkCount: 0
 *                 createdAt: "2025-10-16T10:00:00.000Z"
 *                 updatedAt: "2025-10-16T10:00:00.000Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal error while enqueueing document for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/',
    requirePermission("documents:create"),
    validate(createDocumentSchema),
    createDocument
);

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a document by ID
 *     description: |
 *       Returns the full metadata for a single document. The caller must be the
 *       document owner. Supports conditional `GET` via `If-None-Match` (ETag).
 *
 *       **Required permission:** `documents:read`
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the document
 *         schema:
 *           type: string
 *           format: uuid
 *         example: c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12
 *     responses:
 *       200:
 *         description: Document found
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Document'
 *       304:
 *         description: Not modified (ETag match — client cache is still fresh)
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id',
    requirePermission("documents:read"),
    validate(documentParamsSchema),
    conditionalGet(),
    getDocument
);

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     description: |
 *       Permanently removes the document and all its associated chunks/embeddings.
 *
 *       **Required permission:** `documents:delete` (owner) **or** `admin:documents:delete`
 *       (administrators can delete any document).
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the document to delete
 *         schema:
 *           type: string
 *           format: uuid
 *         example: c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: Document deleted successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id',
    requirePermission("admin:documents:delete", "documents:delete"),
    validate(documentParamsSchema),
    deleteDocument
);

/**
 * @swagger
 * /documents/{id}/processing-status:
 *   get:
 *     summary: Get document processing status
 *     description: |
 *       Returns the current processing status of a document along with how many
 *       chunks have been generated. Poll this endpoint after upload until
 *       `status` becomes `ready` or `failed`.
 *
 *       Typical lifecycle: `pending` → `processing` → `ready` | `failed`
 *
 *       **Required permission:** `documents:read`
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the document
 *         schema:
 *           type: string
 *           format: uuid
 *         example: c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12
 *     responses:
 *       200:
 *         description: Current processing status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DocumentProcessingStatus'
 *             example:
 *               success: true
 *               data:
 *                 id: "c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12"
 *                 status: "processing"
 *                 chunkCount: null
 *                 errorMessage: null
 *                 updatedAt: "2025-10-16T10:01:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/processing-status',
    authenticate,
    requirePermission('documents:read'),
    processingStatus
);

export default router;
