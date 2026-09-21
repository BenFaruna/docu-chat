import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client";
import { config } from './config';

const connectionString = config.DATABASE_URL
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
});

export { prisma };