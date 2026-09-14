// Seeds the first admin user from .env. Run: npm run seed
require('dotenv').config();
const { prisma } = require('../config/prisma');
const { hashPassword } = require('./userUtils');

(async () => {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@scholarsden.local').toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] admin already exists: ${email}`);
  } else {
    const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@2026';
    await prisma.user.create({
      data: {
        name: process.env.SEED_ADMIN_NAME || 'Administrator',
        email,
        role: 'admin',
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`[seed] created admin: ${email} / ${password}`);
  }
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('[seed] failed:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
