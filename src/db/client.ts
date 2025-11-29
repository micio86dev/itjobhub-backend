import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dbClient = prisma;
export { prisma };