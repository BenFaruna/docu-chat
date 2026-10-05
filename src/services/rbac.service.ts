import { prisma } from '../lib/prisma';
import { CACHE_TTL, cacheGetOrSet } from '../lib/cache';

export async function getUserPermissions(
    userId: string
): Promise<Set<string>> {
    const cacheKey = `permissions:${userId}`
    const permissions = await cacheGetOrSet(cacheKey, CACHE_TTL.PERMISSIONS, async () => {
        const userRoles = await prisma.userRole.findMany({
            where: { userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: { permission: true },
                        },
                    },
                },
            },
        });

        const permissions = userRoles.flatMap(({ role }) => role.permissions.map(rp => rp.permission.name));

        return permissions;
    })

    return new Set(permissions);
}
