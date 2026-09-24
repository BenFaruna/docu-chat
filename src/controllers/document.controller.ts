import * as documentService from '../services/document.service';
import type { Request, Response, NextFunction } from 'express';

export const createDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const document = await documentService.createDocument(req.userId, req.file);
        res.status(201).json(document);
    } catch (error) {
        next(error);
    }
};

export const listDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const documents = await documentService.listDocuments(req.userId);
        res.json(documents);
    } catch (error) {
        next(error);
    }
};

export const getDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const document = await documentService.getDocument(req.userId, req.params.id);
        res.json(document);
    } catch (error) {
        next(error);
    }
};

export const deleteDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await documentService.deleteDocument(req.userId, req.params.id);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
};