import { prisma } from "../lib/prisma";

export const tokenRepository = {
    create: async (data: {
        userId: string;
        token: string;
        expiresAt: Date;
    }) => {
        return prisma.refreshToken.create({
            data,
        });
    },

    async delete(tokenHash: string) {
        return prisma.refreshToken.delete({
            where: { token: tokenHash },
        });
    },

    async deleteMany(tokenHash: string) {
        return prisma.refreshToken.deleteMany({
            where: { token: tokenHash },
        });
    },

    async findToken(tokenHash: string) {
        return prisma.refreshToken.findUnique({
            where: { token: tokenHash },
        });
    },
}