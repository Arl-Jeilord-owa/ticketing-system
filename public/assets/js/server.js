// server.js — OMTPI HelpDesk Express server
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');

const authRoutes     = require('./routes/auth');
const ticketRoutes   = require('./routes/tickets');
const employeeRoutes = require('./routes/employees');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
//  Middleware
// ─────────────────────────────────────────────────────────────
app.use(cors({
  origin:      true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000, // 8-hour sessions
  },
}));

// ─────────────────────────────────────────────────────────────
//  Static files — serve everything in /public
// ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────
//  API routes
// ─────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/tickets',   ticketRoutes);
app.use('/api/employees', employeeRoutes);

// ─────────────────────────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────
//  SPA fallback — all non-API GET requests → index.html
// ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ─────────────────────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log(`  ║  OMTPI HelpDesk running               ║`);
  console.log(`  ║  http://localhost:${PORT}               ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
