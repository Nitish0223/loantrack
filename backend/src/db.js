const { Pool } = require('pg');

// One shared pool for the whole process: connections are opened once and
// reused across requests instead of opening a new connection per request.
// Credentials are NOT set here: pg reads PGHOST, PGPORT, PGUSER, PGPASSWORD
// and PGDATABASE from the environment (.env locally, a Secret on Kubernetes).
const pool = new Pool({
  max: Number(process.env.DB_POOL_MAX || 10), // upper bound on open connections
  idleTimeoutMillis: 30000, // close connections idle for 30s
  connectionTimeoutMillis: 3000, // fail fast if the database does not answer
});

// An idle pooled connection can error (e.g. Postgres restarts). Without this
// listener node treats it as an unhandled error and the whole process exits.
pool.on('error', (err) => {
  console.error(`[db] idle client error: ${err.message}`);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry with exponential backoff until the database answers.
// Delay doubles each attempt (500ms, 1s, 2s, 4s ...) and is capped at maxDelayMs.
// maxRetries = 0 means retry forever: the backend logs and keeps waiting
// instead of crashing when it starts before the database.
async function waitForDatabase({
  maxRetries = Number(process.env.DB_MAX_RETRIES || 0),
  baseDelayMs = 500,
  maxDelayMs = 10000,
} = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      console.log(`[db] connected to ${process.env.PGHOST}:${process.env.PGPORT || 5432} (attempt ${attempt})`);
      return;
    } catch (err) {
      if (maxRetries > 0 && attempt >= maxRetries) {
        throw new Error(`database unreachable after ${attempt} attempts: ${err.message}`);
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.warn(`[db] attempt ${attempt} failed: ${err.message} - retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

module.exports = { pool, waitForDatabase };
