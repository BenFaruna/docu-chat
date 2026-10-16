import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/authorize.middleware';
import { prisma } from '../lib/prisma';
import { appEvents } from '../lib/events';
import { NotFoundError } from '../lib/errors';

const router = Router();
router.use(authenticate);
router.use(requirePermission('roles:manage'));

/**
 * @swagger
 * /admin/roles:
 *   get:
 *     summary: List all roles with their permissions
 *     description: |
 *       Returns every role defined in the system, including the list of permission
 *       strings attached to it and a count of users currently assigned that role.
 *
 *       **Required permission:** `roles:manage`
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of roles with permission details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Role'
 *             example:
 *               success: true
 *               data:
 *                 - id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                   name: "editor"
 *                   description: "Can read and create documents"
 *                   isDefault: false
 *                   userCount: 3
 *                   permissions:
 *                     - "documents:read"
 *                     - "documents:create"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/roles', async (req, res) => {
    const roles = await prisma.role.findMany({
        include: {
            permissions: { include: { permission: true } },
            _count: { select: { users: true } },
        },
    });

    res.json({
        success: true,
        data: roles.map(role => ({
            id: role.id,
            name: role.name,
            description: role.description,
            isDefault: role.isDefault,
            userCount: role._count.users,
            permissions: role.permissions.map(rp => rp.permission.name),
        })),
    });
});

/**
 * @swagger
 * /admin/users/{userId}/roles:
 *   post:
 *     summary: Assign a role to a user
 *     description: |
 *       Grants the specified role to the target user. If the user already has
 *       that role the operation is idempotent — it succeeds without duplication.
 *       An audit event (`admin:role-assigned`) is emitted after the assignment.
 *
 *       **Required permission:** `roles:manage`
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: UUID of the target user
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "d4e5f6a7-b8c9-0123-def0-456789012345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRoleRequest'
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "Role 'editor' assigned to user"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: User or role not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               UserNotFound:
 *                 summary: User not found
 *                 value:
 *                   success: false
 *                   error:
 *                     code: NOT_FOUND
 *                     message: User not found
 *               RoleNotFound:
 *                 summary: Role not found
 *                 value:
 *                   success: false
 *                   error:
 *                     code: NOT_FOUND
 *                     message: "Role 'editor' not found"
 */
router.post('/users/:userId/roles', async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { roleName } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundError('User not found');

        const role = await prisma.role.findUnique({ where: { name: roleName } });
        if (!role) throw new NotFoundError(`Role '${roleName}' not found`);

        await prisma.userRole.upsert({
            where: { userId_roleId: { userId, roleId: role.id } },
            update: {},
            create: {
                userId,
                roleId: role.id,
                assignedBy: req.user!.id,
            },
        });

        // Audit event
        appEvents.emit('admin:role-assigned', {
            targetUserId: userId,
            roleName,
            assignedBy: req.user!.id,
        });

        res.json({
            success: true,
            data: { message: `Role '${roleName}' assigned to user` },
        });
    } catch (error) { next(error); }
});

/**
 * @swagger
 * /admin/users/{userId}/roles/{roleName}:
 *   delete:
 *     summary: Revoke a role from a user
 *     description: |
 *       Removes the specified role from the target user. If the user does not
 *       currently have the role the operation completes without error.
 *       An audit event (`admin:role-revoked`) is emitted after revocation.
 *
 *       **Required permission:** `roles:manage`
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: UUID of the target user
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "d4e5f6a7-b8c9-0123-def0-456789012345"
 *       - in: path
 *         name: roleName
 *         required: true
 *         description: Exact name of the role to revoke
 *         schema:
 *           type: string
 *         example: "editor"
 *     responses:
 *       200:
 *         description: Role revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "Role 'editor' revoked"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Role name not found in the system
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error:
 *                 code: NOT_FOUND
 *                 message: Role not found
 */
router.delete('/users/:userId/roles/:roleName',
    async (req, res, next) => {
        try {
            const { userId, roleName } = req.params;

            const role = await prisma.role.findUnique({
                where: { name: roleName },
            });
            if (!role) throw new NotFoundError('Role not found');

            await prisma.userRole.deleteMany({
                where: { userId, roleId: role.id },
            });

            appEvents.emit('admin:role-revoked', {
                targetUserId: userId,
                roleName,
                revokedBy: req.user!.id,
            });

            res.json({
                success: true,
                data: { message: `Role '${roleName}' revoked` },
            });
        } catch (error) { next(error); }
    }
);

export default router;
