import { appEvents } from '../lib/events';
import { cacheDel } from '../lib/cache';
import { logger } from '../lib/logger';

export const CACHE_EVENTS = {
    ROLE_ASSIGNED: 'admin:role-assigned',
    ROLE_REVOKED: 'admin:role-revoked',
    DOC_DELETED: 'doc:deleted',
} as const;

appEvents.on(CACHE_EVENTS.ROLE_ASSIGNED, async (data) => {
    try {
        await cacheDel(`permissions:${data.targetUserId}`);
        logger.info({ data, event: 'role_assigned' }, 'Cache busted: permissions for %s', data.targetUserId);
    } catch (error) {
        logger.error({ err: error, event: 'role_assigned' }, 'Failed to bust permissions cache');
    }
});

appEvents.on(CACHE_EVENTS.ROLE_REVOKED, async (data) => {
    try {
        await cacheDel(`permissions:${data.targetUserId}`);
        logger.info({ data, event: 'role_revoked' }, 'Cache busted: permissions for %s', data.targetUserId);
    } catch (error) {
        logger.error({ err: error, event: 'role_revoked' }, 'Failed to bust permissions cache');
    }
});

appEvents.on(CACHE_EVENTS.DOC_DELETED, async (data) => {
    try {
        await cacheDel(`doc:${data.documentId}`);
    } catch (error) {
        logger.error({ err: error, event: 'doc_deleted' }, 'Failed to bust document cache');
    }
});
