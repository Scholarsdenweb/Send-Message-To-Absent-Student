require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { prisma, connectPrisma } = require('./config/prisma');
const { getPool } = require('./config/sqlserver');
const routes = require('./routes');

const app = express();

const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  let sqlOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch (_) { /* reported below */ }
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    sqlOk = true;
  } catch (_) { /* reported below */ }
  res.json({ status: 'ok', postgres: dbOk, sqlServer: sqlOk });
});

app.use('/api', routes);

// Serve the built React frontend (single-process production deploy).
// Run `npm run build` in ../frontend first; this serves that dist folder.
const clientDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API route returns index.html so client-side routing works.
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log('[server] serving frontend from', clientDist);
} else {
  console.warn('[server] frontend build not found at', clientDist, '- run `npm run build` in frontend/');
}

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await connectPrisma();
    // Warm up the SQL pool but don't crash if the device PC is asleep/offline.
    getPool().catch((e) => console.warn('[sqlserver] initial connect failed (will retry on demand):', e.message));
    app.listen(PORT, () => console.log(`[server] API listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error('[server] startup failed:', err.message);
    process.exit(1);
  }
})();
