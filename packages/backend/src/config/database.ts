import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaGlobal ?? new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

(prisma as any).$on('warn', (e: { message: string }) => {
  logger.warn('Database warning', { message: e.message });
});

(prisma as any).$on('error', (e: { message: string }) => {
  logger.error('Database error', { message: e.message });
});

process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
