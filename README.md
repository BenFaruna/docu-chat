# DocuChat

**DocuChat** is a production-ready Retrieval-Augmented Generation (RAG) API that lets users upload documents and then chat with them using natural language. Documents are chunked, embedded with OpenAI, stored in a PostgreSQL vector database, and retrieved semantically at query time so answers are always grounded in the user's own content.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Installation](#installation)
  - [Database Setup](#database-setup)
  - [Running the Server](#running-the-server)
- [API Reference](#api-reference)
  - [Authentication](#authentication)
  - [Documents](#documents)
  - [Admin](#admin)
  - [Health](#health)
  - [Webhooks](#webhooks)
  - [System Endpoints](#system-endpoints)
- [Agent System](#agent-system)
- [Background Processing](#background-processing)
- [Security](#security)
- [Testing](#testing)

---

## Features

- **Document ingestion** — upload plain-text or PDF content via the REST API; chunking and embedding are handled asynchronously in a BullMQ queue.
- **Semantic search** — vector-similarity search using PostgreSQL `pgvector` with OpenAI `text-embedding-3-small` (1536 dimensions); results cached in Redis.
- **RAG conversations** — multi-turn conversations with citation-aware answers powered by GPT-4o-mini; conversation history is persisted per user.
- **Agentic chat** — a ReAct-style agent loop (GPT-4o) that can invoke tools such as `search_documents` and `final_answer` across up to 10 iterations with configurable cost ceilings and timeouts.
- **RBAC** — fine-grained role-based access control with permissions like `documents:read`, `documents:create`, `documents:delete`, and `roles:manage`.
- **JWT auth** — short-lived access tokens (15 min) with rotating refresh tokens (7 days), stored as SHA-256 hashes.
- **Webhook ingestion** — HMAC-SHA256 signed webhook receiver with idempotency and async processing.
- **Observability** — Prometheus metrics, structured Pino logging, request correlation IDs, and a Bull Board queue monitor (development).
- **Rate limiting** — per-route Redis-backed rate limiters (global API, strict auth, upload).
- **ETag caching** — conditional GET support on document list and detail endpoints.
- **Circuit breaker** — Opossum circuit breaker wrapping every OpenAI API call.

---

## Architecture Overview

```
Client
  │
  ▼
Express API (Helmet, CORS, Rate Limiter, Sanitizer)
  │
  ├── /api/v1/auth        → Auth Controller  → Auth Service      → PostgreSQL
  ├── /api/v1/documents   → Doc Controller   → Document Service  → PostgreSQL
  │                                          → BullMQ Queue      → Document Worker
  │                                            (chunking + embedding via OpenAI)
  ├── /api/v1/admin       → Admin routes     → Prisma ORM        → PostgreSQL
  ├── /api/v1/health      → Health Controller
  ├── /webhooks           → Webhook route    → Prisma ORM
  ├── /metrics            → Prometheus registry
  └── /api-docs           → Swagger UI
        │
        ▼ (chat / agent calls)
  Conversation Service → Semantic Search (pgvector) → RAG Service → OpenAI
  Agent Executor       → Tool Registry (search_documents, final_answer)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (ESM) |
| Web framework | Express 5 |
| ORM / DB | Prisma 7 + PostgreSQL + `pgvector` |
| Queue | BullMQ + Redis (ioredis) |
| LLM / Embeddings | OpenAI API (GPT-4o, GPT-4o-mini, text-embedding-3-small) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Zod 4 |
| Logging | Pino + pino-pretty |
| Metrics | @prometheus-io/client |
| Circuit breaker | Opossum |
| API docs | Swagger UI (swagger-jsdoc) |
| Testing | Vitest + Supertest |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 15 with the [`pgvector`](https://github.com/pgvector/pgvector) extension enabled
- Redis ≥ 7
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | `development` \| `production` \| `test` | ✅ |
| `PORT` | HTTP port (default `3000`) | |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | Secret key for signing JWTs | ✅ |
| `JWT_EXPIRES_IN` | Access token lifetime (e.g. `15m`) | ✅ |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifetime (e.g. `7d`) | ✅ |
| `REDIS_HOST` | Redis hostname | ✅ |
| `REDIS_PORT` | Redis port | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | ✅ |
| `FRONTEND_URL` | Allowed CORS origin | ✅ |
| `WEBHOOK_SECRET` | HMAC secret for webhook signature verification | ✅ |

### Installation

```bash
npm install
```

### Database Setup

```bash
# Apply migrations
npx prisma migrate deploy

# Seed roles and permissions
npx tsx prisma/seed.ts
```

### Running the Server

```bash
# Development (watch mode)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:3000` (or the value of `PORT`).

Interactive API docs are available at [`/api-docs`](http://localhost:3000/api-docs).

---

## API Reference

All API routes live under the `/api/v1` prefix unless stated otherwise. Every response follows the same envelope:

```jsonc
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

---

### Authentication

Base path: `/api/v1/auth`

All auth endpoints are **public** (no token required) and are rate-limited more strictly than the general API.

#### `POST /auth/register`

Create a new user account. Returns a token pair on success.

**Request body**

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "SecurePass1"
}
```

Password rules: ≥ 8 characters, at least one uppercase letter, at least one number.

**Responses**

| Status | Meaning |
|---|---|
| `201` | User created. Body contains `accessToken`, `refreshToken`, `expiresIn`. |
| `400` | Validation error. |
| `409` | Email already registered. |
| `429` | Too many requests. |

---

#### `POST /auth/login`

Authenticate with email and password.

**Request body**

```json
{
  "email": "alice@example.com",
  "password": "SecurePass1"
}
```

**Responses**

| Status | Meaning |
|---|---|
| `200` | Success. Body contains `accessToken`, `refreshToken`, `expiresIn`. |
| `400` | Validation error. |
| `401` | Invalid credentials. |
| `429` | Too many requests. |

---

#### `POST /auth/refresh`

Exchange a valid refresh token for a new token pair. The old refresh token is immediately invalidated (token rotation).

**Request body**

```json
{
  "refreshToken": "<refresh_token>"
}
```

**Responses**

| Status | Meaning |
|---|---|
| `200` | New `accessToken` and `refreshToken` returned. |
| `401` | Token missing, expired, or revoked. |

---

#### `POST /auth/logout`

Revoke a refresh token. The access token expires naturally.

**Request body**

```json
{
  "refreshToken": "<refresh_token>"
}
```

**Responses**

| Status | Meaning |
|---|---|
| `200` | Token revoked. |
| `400` | Validation error. |

---

### Documents

Base path: `/api/v1/documents`

All document endpoints **require a valid Bearer token** (`Authorization: Bearer <accessToken>`).

#### `GET /documents`

List the authenticated user's documents with pagination, filtering, and sorting.

**Required permission:** `documents:read`

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | integer 1–100 | `20` | Items per page |
| `status` | `pending` \| `processing` \| `ready` \| `failed` | — | Filter by processing status |
| `search` | string (max 200) | — | Case-insensitive title search |
| `sortBy` | `createdAt` \| `title` \| `chunkCount` | `createdAt` | Sort field |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction |

Supports **ETag / conditional GET**: include `If-None-Match` with a previously returned ETag to get `304 Not Modified` when nothing has changed.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12",
        "title": "Annual Report 2025",
        "status": "ready",
        "chunkCount": 42,
        "createdAt": "2025-10-16T10:00:00.000Z",
        "updatedAt": "2025-10-16T10:02:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 1 }
  }
}
```

---

#### `POST /documents`

Upload a new document. The document is created immediately with `status: "pending"` and enqueued for async processing (chunking → embedding).

**Required permission:** `documents:create`

**Request body**

```json
{
  "title": "Annual Report 2025",
  "content": "<full document text>"
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "c47b2f1e-8a3d-4b2e-9f1a-0e5c3d7f8b12",
    "title": "Annual Report 2025",
    "status": "pending",
    "chunkCount": 0,
    "createdAt": "2025-10-16T10:00:00.000Z",
    "updatedAt": "2025-10-16T10:00:00.000Z"
  }
}
```

Poll `GET /documents/{id}/processing-status` to track progress.

---

#### `GET /documents/{id}`

Fetch metadata for a single document. Supports conditional GET via `If-None-Match`.

**Required permission:** `documents:read`

**Path parameter:** `id` — UUID of the document.

**Responses**

| Status | Meaning |
|---|---|
| `200` | Document found. |
| `304` | Not modified (ETag match). |
| `404` | Document not found or not owned by caller. |

---

#### `DELETE /documents/{id}`

Permanently soft-delete a document and all its associated chunks/embeddings.

**Required permission:** `documents:delete` (own documents) or `admin:documents:delete` (any document).

**Path parameter:** `id` — UUID of the document.

**Response `200`**

```json
{
  "success": true,
  "data": { "message": "Document deleted successfully" }
}
```

---

#### `GET /documents/{id}/processing-status`

Poll the processing state of a document after upload.

**Required permission:** `documents:read`

**Path parameter:** `id` — UUID of the document.

**Lifecycle:** `pending` → `processing` → `ready` | `failed`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "status": "processing",
    "error": null,
    "progress": 42
  }
}
```

---

### Admin

Base path: `/api/v1/admin`

All admin endpoints require **`roles:manage`** permission.

#### `GET /admin/roles`

List all roles defined in the system, including their permissions and user counts.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name": "editor",
      "description": "Can read and create documents",
      "isDefault": false,
      "userCount": 3,
      "permissions": ["documents:read", "documents:create"]
    }
  ]
}
```

---

#### `POST /admin/users/{userId}/roles`

Assign a role to a user. Idempotent — calling it when the user already has the role succeeds without duplication. Emits an `admin:role-assigned` audit event.

**Path parameter:** `userId` — UUID of the target user.

**Request body**

```json
{
  "roleName": "editor"
}
```

**Responses**

| Status | Meaning |
|---|---|
| `200` | Role assigned. |
| `404` | User or role not found. |

---

#### `DELETE /admin/users/{userId}/roles/{roleName}`

Revoke a role from a user. Emits an `admin:role-revoked` audit event.

**Path parameters:**
- `userId` — UUID of the target user.
- `roleName` — Exact name of the role (e.g. `editor`).

**Responses**

| Status | Meaning |
|---|---|
| `200` | Role revoked. |
| `404` | Role name not found. |

---

### Health

Base path: `/api/v1/health`

Health endpoints are **public** (no authentication required) so that orchestrators (Kubernetes, ECS, etc.) can reach them freely.

#### `GET /health/live`

**Liveness probe.** Confirms the process is running. A non-2xx response means the container should be restarted.

**Response `200`**
```json
{ "status": "ok", "timestamp": "2025-10-16T10:00:00.000Z" }
```

---

#### `GET /health/ready`

**Readiness probe.** Confirms the process is ready to serve traffic *and* that downstream dependencies (database, Redis) are reachable. A non-2xx response means the instance should be removed from the load-balancer rotation temporarily.

**Response `200`**
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

**Response `503`** — one or more dependencies unavailable.

---

### Webhooks

Base path: `/webhooks`

#### `POST /webhooks/example`

Receive a signed event from an external provider.

**Authentication:** Every request must include a valid HMAC-SHA256 signature in the `X-Webhook-Signature` header (`sha256=<hex-digest>`). Requests with missing or invalid signatures are rejected with `401`.

**Idempotency:** Each event carries a unique `id`. If the same event ID has already been fully processed, the endpoint returns `200` with `duplicate: true` and performs no further work.

**Supported event types**

| Event type | Description |
|---|---|
| `document.imported` | Triggers the document processing pipeline |

Unknown event types are acknowledged without error.

**Request body**

```json
{
  "id": "evt_01J2X3Y4Z5",
  "type": "document.imported",
  "data": {
    "documentUrl": "https://storage.example.com/docs/report.pdf",
    "userId": "d4e5f6a7-b8c9-0123-def0-456789012345"
  }
}
```

**Responses**

| Status | Meaning |
|---|---|
| `202` | Event received and queued for async processing. |
| `200` | Duplicate event — already processed. |
| `401` | Invalid or missing webhook signature. |
| `400` | Malformed JSON body. |

---

### System Endpoints

These endpoints are mounted directly on the application (no `/api/v1` prefix).

| Endpoint | Description | Auth |
|---|---|---|
| `GET /health` | Quick liveness check | Public |
| `GET /metrics` | Prometheus metrics scrape endpoint | Public |
| `GET /api-docs` | Swagger UI (interactive API documentation) | Public |
| `GET /api-docs.json` | Raw OpenAPI JSON spec | Public |
| `GET /admin/queues` | Bull Board queue monitor (development only) | Public (dev) |

---

## Agent System

DocuChat includes a **ReAct-style agentic loop** (`src/agents/executor.ts`) for complex multi-step queries.

### How it works

1. The user's question and a system prompt are sent to GPT-4o with the available tool schemas.
2. The model decides whether to call a tool or respond directly.
3. If a tool is called, the result is fed back to the model as an observation.
4. This think → act → observe cycle repeats until the model calls `final_answer` or a safety limit is reached.

### Safety limits

| Limit | Default |
|---|---|
| Max iterations | 10 |
| Timeout | 60 seconds |
| Cost ceiling | $0.50 USD |

### Available tools

| Tool | Description |
|---|---|
| `search_documents` | Semantic search across the user's uploaded documents. Accepts a `query` string (3–500 chars), an optional `documentId` to scope the search, and `topK` (1–10, default 5). Returns ranked passages with similarity scores. |
| `final_answer` | Terminates the loop and returns the structured answer with optional source citations and a confidence level. |

---

## Background Processing

Document ingestion runs asynchronously via **BullMQ** (backed by Redis).

**Processing pipeline:**

```
POST /documents
    │
    ├── Document record created (status: "pending")
    └── Job enqueued → Document Worker
            │
            ├── 1. Chunk the document content
            ├── 2. Generate embeddings in batches (cached)
            │       └── Redis embedding cache (7-day TTL)
            ├── 3. Store chunks + vectors in PostgreSQL (pgvector)
            └── 4. Update document status → "ready" (or "failed")
```

Poll `GET /documents/{id}/processing-status` to check progress.

In development, the **Bull Board** UI is available at `/admin/queues`.

---

## Security

| Mechanism | Implementation |
|---|---|
| Security headers | Helmet (strict CSP, `X-Frame-Options`, etc.) |
| CORS | Allowlist-based; configurable via `FRONTEND_URL` |
| Input sanitisation | XSS-sanitised request bodies via `xss` |
| Authentication | Bearer JWT (`HS256`); refresh tokens stored as SHA-256 hashes |
| Authorisation | Role-based with per-resource permissions |
| Rate limiting | Redis-backed per-route limiters (global, auth, upload) |
| Webhook verification | HMAC-SHA256 (`crypto.timingSafeEqual`) |
| Circuit breaker | Opossum wrapping all OpenAI API calls |

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests use **Vitest** and **Supertest**. The test environment is configured via `.env.test`.
