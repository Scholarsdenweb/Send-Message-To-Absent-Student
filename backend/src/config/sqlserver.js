const sql = require('mssql');

// Singleton connection pool to the eTimeTrackLite SQL Server.
// The pool auto-reconnects; getPool() lazily (re)connects if needed.
let pool = null;
let connecting = null;

function buildConfig() {
  return {
    server: process.env.SQL_SERVER || 'localhost',
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 1433,
    database: process.env.SQL_DATABASE || 'etimetracklite1',
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: String(process.env.SQL_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: { max: 8, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

async function getPool() {
  if (pool && pool.connected) return pool;
  if (connecting) return connecting;
  connecting = (async () => {
    try {
      const p = new sql.ConnectionPool(buildConfig());
      p.on('error', (err) => console.error('[sqlserver] pool error:', err.message));
      await p.connect();
      pool = p;
      console.log(`[sqlserver] connected: ${process.env.SQL_SERVER}:${process.env.SQL_PORT}/${process.env.SQL_DATABASE}`);
      return pool;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

// Convenience: run a query with named inputs.
// inputs = { name: value } or { name: { type, value } }
async function query(text, inputs = {}) {
  const p = await getPool();
  const req = p.request();
  for (const [key, val] of Object.entries(inputs)) {
    if (val && typeof val === 'object' && 'type' in val) req.input(key, val.type, val.value);
    else req.input(key, val);
  }
  return req.query(text);
}

module.exports = { sql, getPool, query };
