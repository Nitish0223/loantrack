const express = require('express');
const os = require('os');
const { pool } = require('./db');

const app = express();
app.use(express.json());

// Name of the container/pod serving this request. In Kubernetes HOSTNAME is the
// pod name, so with 3 replicas you can see which pod answered each request.
const POD_NAME = process.env.HOSTNAME || os.hostname();

app.use((req, res, next) => {
  res.set('X-Served-By', POD_NAME);
  next();
});

// Liveness: is the node process alive and able to answer HTTP?
// Deliberately does NOT touch the database: if Postgres is down, restarting
// this container would not fix anything, so liveness must stay green.
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', pod: POD_NAME });
});

// Readiness: can this instance actually serve traffic right now?
// Checks the database; returns 503 when it is unreachable so Kubernetes stops
// sending traffic to this pod (without restarting it) until the DB is back.
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', pod: POD_NAME });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message, pod: POD_NAME });
  }
});

module.exports = { app, POD_NAME };
