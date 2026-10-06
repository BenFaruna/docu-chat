import { appEvents } from '../lib/events';
import { cacheRedis } from '../lib/cache';
import { logger } from '../lib/logger';
import { AUTH_EVENTS } from './auth.event';

appEvents.on(AUTH_EVENTS.LOGIN_FAILED, async (data) => {
    try {
        const key = `login-failures:${data.deviceInfo}`;
        const failures = await cacheRedis.incr(key);

        // Set expiry on first failure
        if (failures === 1) {
            await cacheRedis.expire(key, 900);  // 15 minute window
        }

        if (failures >= 5) {
            logger.warn(
                { data, event: 'login-failures' }, 'Failed login attempt for %s from %s', data.email, data.deviceInfo);
            // Could add the IP to a temporary block list here
        }
    } catch (error) {
        logger.error({ err: error, event: 'login-failures' }, 'Failed to track login failure');
    }
});
