import type { Request, Response, NextFunction } from 'express';

import * as documentService from '../services/document.service';

export const createDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const doc = await documentService.createDocument({ ...req.body, userId: req.user!.id });
        res.status(202).json(doc);
    } catch (error) {
        next(error);
    }
};

export const listDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const documents = await documentService.listDocuments(req.user!.id,
            { page: Number(req.params?.page), limit: Number(req.params?.limit) });
        res.json(documents);
    } catch (error) {
        next(error);
    }
};

export const getDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const doc = await documentService.getDocument(req.user!.id, req.params.id as string);
        res.json({ success: true, data: doc });
    } catch (error) {
        next(error);
    }
};

export const deleteDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await documentService.deleteDocument(req.user!.id, req.params.id as string);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
};