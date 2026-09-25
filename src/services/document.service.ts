import { getUserPermissions } from './rbac.service';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../lib/errors';
import { appEvents } from '../lib/events';
import { DOC_EVENTS } from '../events/document.event';
import { documentQueue } from '../queues/document.queue';

interface ListDocumentsOptions {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  sortBy?: 'createdAt' | 'title' | 'chunkCount';
  sortOrder?: 'asc' | 'desc';
}

import { queueDocumentForProcessing } from '../queues/document.queue';

export async function createDocument(data: {
  title: string;
  content: string;
  userId: string;
}) {
  // Create the document with pending status
  const doc = await prisma.document.create({
    data: {
      userId: data.userId,
      title: data.title,
      filename: data.title.toLowerCase().replace(/\s+/g, '-'),
      content: data.content,
      status: 'pending',
    },
  });

  // Queue for background processing
  const jobId = await queueDocumentForProcessing(doc.id, data.userId);

  appEvents.emit('doc:created', {
    userId: data.userId,
    documentId: doc.id,
    title: doc.title,
  });

  return { document: doc, jobId };
}


export async function listDocuments(
  userId: string,
  options: ListDocumentsOptions
) {
  const {
    page, limit,
    status, search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  // Build the where clause dynamically
  const where: any = {
    userId,
    deletedAt: null,
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
    where.description = { contains: search, mode: 'insensitive' };
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        filename: true,
        status: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.document.count({ where }),
  ]);

  return {
    data: documents,
    meta: { page, limit, total },
  };
}

export async function getDocument(userId: string, docId: string) {
  const doc = await prisma.document.findUnique({
    where: {
      id: docId,
      deletedAt: null,
    },
  });

  if (!doc) {
    throw new NotFoundError('Document not found');
  }

  // Resource ownership check
  if (doc.userId !== userId) {
    // Admins can see everything
    const permissions = await getUserPermissions(userId);
    if (!permissions.has('users:manage')) {
      throw new NotFoundError('Document not found');
    }
  }

  return doc
}

export async function deleteDocument(
  userId: string,
  documentId: string
) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.deletedAt) {
    throw new NotFoundError('Document not found');
  }

  // Ownership check
  if (doc.userId !== userId) {
    throw new NotFoundError('Document not found');
  }

  appEvents.emit(DOC_EVENTS.DELETED, {
    deletedBy: userId,
    documentId: doc.id,
    title: doc.title,
  });

  return prisma.document.update({
    where: { id: documentId },
    data: {
      deletedAt: new Date(),
      deletedBy: userId,
    },
  });
}

export const processingStatus = async (userId: string, docId: string) => {

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, status: true, error: true, userId: true },
  });

  if (!doc || doc.userId !== userId) {
    throw new NotFoundError('Document not found');
  }

  // Try to find the active job for this document
  const jobs = await documentQueue.getJobs(['active', 'waiting']);
  const activeJob = jobs.find(
    j => j.data.documentId === docId
  );

  return ({
    status: doc.status,
    error: doc.error,
    progress: activeJob ? await activeJob.progress : null,
  });
}