const { app, POD_NAME } = require('./app');
const { pool, waitForDatabase } = require('./db');

const PORT = Number(process.env.PORT || 8080);

// Start listening first so /healthz answers immediately (liveness stays green),
// then wait for the database in the background. Until it is reachable,
// /readyz returns 503 and no traffic is routed to this instance.
const server = app.listen(PORT, () => {
  console.log(`[api] ${POD_NAME} listening on port ${PORT}`);
  waitForDatabase().catch((err) => {
    console.error(`[db] giving up: ${err.message}`);
    process.exit(1);
  });
});

// Graceful shutdown. Docker and Kubernetes send SIGTERM before killing a
// container: stop accepting new connections, let in-flight requests finish,
// close the pool, then exit. This avoids dropped requests during rolling updates.
function shutdown(signal) {
  console.log(`[api] received ${signal}, shutting down`);
  server.close(async () => {
    await pool.end();
    console.log('[api] closed http server and db pool');
    process.exit(0);
  });
  // Safety net: force exit if connections do not drain within 10s.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
