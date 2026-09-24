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
} from '../controllers/document.controller';
import { requirePermission } from '../middlewares/authorize.middleware';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: List user's documents
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, ready, failed]
 *     responses:
 *       200:
 *         description: List of documents
 *       401:
 *         description: Not authenticated
 */
router.get('/',
    requirePermission("documents:read"),
    validate(listDocumentsSchema),
    listDocuments
);

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Upload and process a new document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document created and processing started
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal processing error
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
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - not owner
 *       404:
 *         description: Document not found
 */
router.get('/:id',
    requirePermission("documents:read"),
    validate(documentParamsSchema),
    getDocument
);

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - not owner
 *       404:
 *         description: Document not found
 */
router.delete('/:id',
    requirePermission("admin:documents:delete", "documents:delete"),
    validate(documentParamsSchema),
    deleteDocument
);

export default router;
