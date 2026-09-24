import { getUserPermissions } from './rbac.service';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../lib/errors';
import { appEvents } from '../lib/events';
import { DOC_EVENTS } from '../events/document.event';

interface ListDocumentsOptions {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  sortBy?: 'createdAt' | 'title' | 'chunkCount';
  sortOrder?: 'asc' | 'desc';
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

async function getDocument(req: Request, res: Response) {
  const doc = await prisma.document.findUnique({
    where: {
      id: req.params.id,
      deletedAt: null,
    },
  });

  if (!doc) {
    throw new NotFoundError('Document not found');
  }

  // Resource ownership check
  if (doc.userId !== req.user!.id) {
    // Admins can see everything
    const permissions = await getUserPermissions(req.user!.id);
    if (!permissions.has('users:manage')) {
      throw new NotFoundError('Document not found');
    }
  }

  res.json({ success: true, data: doc });
}

export async function deleteDocument(
  documentId: string,
  userId: string
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
