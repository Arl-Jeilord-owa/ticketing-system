// server.js — OMTPI HelpDesk entry point
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Middleware ─────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   IS_PROD,   // true in production (HTTPS only)
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

// ── Request logger (dev only) ──────────────────────────────
if (!IS_PROD) {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Static files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/tickets',   require('./routes/tickets'));
app.use('/api/mail',      require('./routes/mail'));

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// ── API 404 ────────────────────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

// ── SPA fallback — all non-API routes → index.html ─────────
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ───────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  OMTPI HelpDesk running at http://localhost:${PORT}`);
  console.log(`    Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`    Database    : ${process.env.DB_NAME}@${process.env.DB_HOST}\n`);
});