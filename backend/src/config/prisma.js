const { PrismaClient } = require('@prisma/client');

// Single PrismaClient for the whole app (Neon Postgres).
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

async function connectPrisma() {
  await prisma.$connect();
  console.log('[prisma] connected to Neon Postgres');
  return prisma;
}

module.exports = { prisma, connectPrisma };
