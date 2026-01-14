import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['info', 'warn', 'error'],
});

export const dbClient = prisma;
export { prisma };