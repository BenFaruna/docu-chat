
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authService from '../auth.service';
import { prisma } from '../../lib/prisma';

vi.mock('../../lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        refreshToken: {
            create: vi.fn(),
            findUnique: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

// Mock the events so they don't actually fire
vi.mock('../../lib/events', () => ({
    appEvents: { emit: vi.fn() },
}));

describe('auth.service.register', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates a user with a hashed password', async () => {
        (prisma.user.findUnique as any).mockResolvedValue(null);
        (prisma.user.create as any).mockResolvedValue({
            id: 'uuid-1',
            email: 'test@example.com',
            tier: 'free',
            passwordHash: '$2b$12$...',
        });

        const result = await authService.register({
            name: 'John Doe',
            email: 'test@example.com',
            password: 'SecurePass1',
        });

        expect(prisma.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                name: 'John Doe',
                email: 'test@example.com',
                passwordHash: expect.stringMatching(/^\$2[aby]\$/),
            }),
        });
        expect(result).not.toHaveProperty('passwordHash');
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('email');
    });

    it('throws ConflictError if email exists', async () => {
        (prisma.user.findUnique as any).mockResolvedValue({
            id: 'existing',
        });

        await expect(
            authService.register({
                name: 'John Doe',
                email: 'taken@example.com',
                password: 'SecurePass1',
            })
        ).rejects.toThrow('Email already registered');
    });
});


describe('auth.service.login', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns tokens for valid credentials', async () => {
        const bcrypt = await import('bcryptjs');
        const hash = await bcrypt.hash('SecurePass1', 12);

        (prisma.user.findUnique as any).mockResolvedValue({
            id: 'uuid-1',
            email: 'test@example.com',
            tier: 'free',
            isActive: true,
            passwordHash: hash,
        });
        (prisma.refreshToken.create as any).mockResolvedValue({});

        const result = await authService.login({
            email: 'test@example.com',
            password: 'SecurePass1',
        });

        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
        expect(result.user.email).toBe('test@example.com');
    });

    it('throws for wrong password', async () => {
        const bcrypt = await import('bcryptjs');
        const hash = await bcrypt.hash('RealPassword1', 12);

        (prisma.user.findUnique as any).mockResolvedValue({
            id: 'uuid-1',
            email: 'test@example.com',
            isActive: true,
            passwordHash: hash,
        });

        await expect(
            authService.login({
                email: 'test@example.com',
                password: 'WrongPassword1',
            })
        ).rejects.toThrow('Invalid credentials');
    });

    it('throws the same error for non-existent user', async () => {
        (prisma.user.findUnique as any).mockResolvedValue(null);

        await expect(
            authService.login({
                email: 'nobody@example.com',
                password: 'Whatever1',
            })
        ).rejects.toThrow('Invalid credentials');
    });
});

