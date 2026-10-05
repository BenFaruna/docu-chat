import { appEvents } from '../lib/events';
import { cacheDel } from '../lib/cache';

export const CACHE_EVENTS = {
    ROLE_ASSIGNED: 'admin:role-assigned',
    ROLE_REVOKED: 'admin:role-revoked',
    DOC_DELETED: 'doc:deleted',
} as const;

appEvents.on(CACHE_EVENTS.ROLE_ASSIGNED, async (data) => {
    try {
        await cacheDel(`permissions:${data.targetUserId}`);
        console.log(`Cache busted: permissions for ${data.targetUserId}`);
    } catch (error) {
        console.error('Failed to bust permissions cache:', error);
    }
});

appEvents.on(CACHE_EVENTS.ROLE_REVOKED, async (data) => {
    try {
        await cacheDel(`permissions:${data.targetUserId}`);
    } catch (error) {
        console.error('Failed to bust permissions cache:', error);
    }
});

appEvents.on(CACHE_EVENTS.DOC_DELETED, async (data) => {
    try {
        await cacheDel(`doc:${data.documentId}`);
    } catch (error) {
        console.error('Failed to bust document cache:', error);
    }
});
