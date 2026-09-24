import type { Request, Response, NextFunction } from 'express';
import { getUserPermissions } from '../services/rbac.service';
import { ForbiddenError } from '../lib/errors';

export function authorize(...allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

export function requirePermission(...requiredPermissions: string[]) {

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new ForbiddenError('Not authenticated');
            }

            const userPermissions = await getUserPermissions(req.user.id);

            const missing = requiredPermissions.filter(
                p => !userPermissions.has(p)
            );

            if (missing.length > 0) {
                throw new ForbiddenError(
                    `You do not have the required permission.`
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

