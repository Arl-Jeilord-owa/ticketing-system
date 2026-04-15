require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');

const authRoutes   = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,       // set true in production with HTTPS
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,  // 8-hour session
  },
}));

// ── Static files ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/tickets', ticketRoutes);

// ── SPA fallback (all non-API routes → index.html) ───────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`OMTPI HelpDesk running at http://localhost:${PORT}`);
});