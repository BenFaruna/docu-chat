import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'DocuChat API',
            version: '1.0.0',
            description: 'AI-Powered Document Q&A System — upload documents, ask questions, get AI-generated answers with source citations.',
            contact: {
                name: 'DocuChat Support',
                url: 'https://github.com/BenFaruna/docu-chat',
            },
            license: {
                name: 'ISC',
            },
        },
        servers: [
            { url: '/api/v1', description: 'Production (v1)' },
            { url: 'http://localhost:3000/api/v1', description: 'Local development' },
        ],
        tags: [
            { name: 'Authentication', description: 'User registration, login, token refresh and logout' },
            { name: 'Documents', description: 'Document upload, retrieval and lifecycle management' },
            { name: 'Admin', description: 'Role and permission management (requires roles:manage)' },
            { name: 'Webhooks', description: 'Inbound webhook endpoints for external integrations' },
            { name: 'Health', description: 'Liveness and readiness probes' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT access token obtained from POST /auth/login',
                },
            },
            schemas: {
                // ── Generic wrappers ──────────────────────────────────────────
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        data: { type: 'object' },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    required: ['success', 'error'],
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            required: ['code', 'message'],
                            properties: {
                                code: { type: 'string', example: 'VALIDATION_ERROR' },
                                message: { type: 'string', example: 'Request validation failed' },
                                details: {
                                    type: 'array',
                                    items: { type: 'object' },
                                    description: 'Field-level validation errors (optional)',
                                },
                            },
                        },
                    },
                },
                PaginationMeta: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 20 },
                        total: { type: 'integer', example: 100 },
                        totalPages: { type: 'integer', example: 5 },
                    },
                },
                // ── Auth ─────────────────────────────────────────────────────
                RegisterRequest: {
                    type: 'object',
                    required: ['name', 'email', 'password'],
                    properties: {
                        name: { type: 'string', minLength: 3, example: 'Jane Doe' },
                        email: { type: 'string', format: 'email', example: 'jane@example.com' },
                        password: {
                            type: 'string', minLength: 8, maxLength: 128,
                            description: 'Must contain an uppercase letter and a number',
                            example: 'SecurePass1',
                        },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'jane@example.com' },
                        password: { type: 'string', example: 'SecurePass1' },
                    },
                },
                TokenRequest: {
                    type: 'object',
                    required: ['refreshToken'],
                    properties: {
                        refreshToken: {
                            type: 'string',
                            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        },
                    },
                },
                AuthTokens: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        expiresIn: { type: 'integer', description: 'Seconds until access token expires', example: 900 },
                    },
                },
                // ── Document ─────────────────────────────────────────────────
                Document: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid', example: 'c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12' },
                        title: { type: 'string', example: 'Q3 Financial Report' },
                        status: {
                            type: 'string',
                            enum: ['pending', 'processing', 'ready', 'failed'],
                            example: 'ready',
                        },
                        chunkCount: { type: 'integer', example: 42 },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                CreateDocumentRequest: {
                    type: 'object',
                    required: ['title', 'content'],
                    properties: {
                        title: { type: 'string', minLength: 1, maxLength: 500, example: 'Annual Report 2025' },
                        content: { type: 'string', minLength: 1, example: 'Full text content of the document...' },
                    },
                },
                DocumentProcessingStatus: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        status: { type: 'string', enum: ['pending', 'processing', 'ready', 'failed'] },
                        chunkCount: { type: 'integer', nullable: true },
                        errorMessage: { type: 'string', nullable: true },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                // ── Admin / Roles ─────────────────────────────────────────────
                Permission: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', example: 'documents:read' },
                    },
                },
                Role: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'editor' },
                        description: { type: 'string', nullable: true, example: 'Can read and create documents' },
                        isDefault: { type: 'boolean', example: false },
                        userCount: { type: 'integer', example: 5 },
                        permissions: {
                            type: 'array',
                            items: { type: 'string' },
                            example: ['documents:read', 'documents:create'],
                        },
                    },
                },
                AssignRoleRequest: {
                    type: 'object',
                    required: ['roleName'],
                    properties: {
                        roleName: { type: 'string', example: 'editor' },
                    },
                },
                // ── Webhook ───────────────────────────────────────────────────
                WebhookEvent: {
                    type: 'object',
                    required: ['id', 'type'],
                    properties: {
                        id: { type: 'string', description: 'Unique event ID for idempotency', example: 'evt_01J2X3Y4Z5' },
                        type: { type: 'string', description: 'Event type identifier', example: 'document.imported' },
                        data: { type: 'object', description: 'Event-specific payload', additionalProperties: true },
                    },
                },
                WebhookAck: {
                    type: 'object',
                    properties: {
                        received: { type: 'boolean', example: true },
                        duplicate: { type: 'boolean', example: false },
                    },
                },
            },
            responses: {
                Unauthorized: {
                    description: 'Missing or invalid authentication token',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' },
                            example: {
                                success: false,
                                error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
                            },
                        },
                    },
                },
                Forbidden: {
                    description: 'Authenticated but lacks required permission',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' },
                            example: {
                                success: false,
                                error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
                            },
                        },
                    },
                },
                NotFound: {
                    description: 'Requested resource does not exist',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' },
                            example: {
                                success: false,
                                error: { code: 'NOT_FOUND', message: 'Resource not found' },
                            },
                        },
                    },
                },
                ValidationError: {
                    description: 'Request body or query parameters failed validation',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' },
                            example: {
                                success: false,
                                error: {
                                    code: 'VALIDATION_ERROR',
                                    message: 'Request validation failed',
                                    details: [{ field: 'email', message: 'Must be a valid email' }],
                                },
                            },
                        },
                    },
                },
                TooManyRequests: {
                    description: 'Rate limit exceeded',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' },
                            example: {
                                success: false,
                                error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
                            },
                        },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
