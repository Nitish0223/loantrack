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

// List all loans, oldest first. The pod name is included in the body so
// load balancing across replicas is visible from the browser or curl.
app.get('/loans', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, borrower_name, loan_amount, property_city, status, created_at
         FROM loans
        ORDER BY id`,
    );
    res.json({ pod: POD_NAME, count: rows.length, loans: rows });
  } catch (err) {
    next(err);
  }
});

// Create a loan. Values are passed as $1..$4 parameters, never concatenated
// into the SQL string, so user input cannot inject SQL.
app.post('/loans', async (req, res, next) => {
  const { borrower_name: name, loan_amount: amount, property_city: city, status } = req.body || {};

  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'borrower_name is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'loan_amount must be a positive number' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO loans (borrower_name, loan_amount, property_city, status)
       VALUES ($1, $2, $3, COALESCE($4, 'PENDING'))
       RETURNING id, borrower_name, loan_amount, property_city, status, created_at`,
      [name.trim(), parsedAmount, city || null, status || null],
    );
    return res.status(201).json({ pod: POD_NAME, loan: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// Anything that throws above ends here: log it and return JSON instead of
// express' default HTML error page. Internal details are not sent to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[api] ${req.method} ${req.path} failed: ${err.message}`);
  res.status(500).json({ error: 'internal server error', pod: POD_NAME });
});

module.exports = { app, POD_NAME };
