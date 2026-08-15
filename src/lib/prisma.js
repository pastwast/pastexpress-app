import { PrismaClient } from '@prisma/client';

// Évite de recréer une connexion à chaque rechargement en dev
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
