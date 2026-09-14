const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
const { hashPassword, verifyPassword, toSafeUser } = require('../utils/userUtils');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' });

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  return res.json({ token: signToken(user), user: toSafeUser(user) });
}

async function me(req, res) {
  return res.json({ user: toSafeUser(req.user) });
}

// Admin: create a member/admin user.
async function createUser(req, res) {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ message: 'name, email, password required' });
  if (role && !['admin', 'member'].includes(role)) return res.status(400).json({ message: 'invalid role' });

  const normEmail = String(email).toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email: normEmail } });
  if (exists) return res.status(409).json({ message: 'A user with this email already exists' });

  const user = await prisma.user.create({
    data: { name, email: normEmail, role: role || 'member', passwordHash: await hashPassword(password) },
  });
  return res.status(201).json({ user: toSafeUser(user) });
}

async function listUsers(req, res) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ users: users.map(toSafeUser) });
}

module.exports = { login, me, createUser, listUsers };
