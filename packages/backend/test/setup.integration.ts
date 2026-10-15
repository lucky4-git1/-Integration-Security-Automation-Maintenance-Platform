import 'dotenv/config';
import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/database.js';

beforeAll(async () => {
  // Ensure database is connected
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});
