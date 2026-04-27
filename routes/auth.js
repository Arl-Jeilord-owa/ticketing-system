// routes/auth.js — Employee login, session, sign-out
require('dotenv').config();
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');

// ── POST /api/auth/employee-login ──────────────────────────
router.post('/employee-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const lower = email.toLowerCase().trim();

    const [rows] = await db.query(
      'SELECT * FROM employees WHERE email = ? AND active = 1 LIMIT 1',
      [lower]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'No active account found for this email.' });
    }

    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    // Session shape — used by requireEmployee / requireAdmin in all routes
    req.session.user = {
      id:      user.id,
      name:    user.name,
      email:   user.email,
      role:    'employee',   // marks this as a logged-in staff member
      empRole: user.role,    // 'admin' | 'agent' | 'viewer'
      dept:    user.dept,
    };

    return res.json({
      success: true,
      user: {
        id:      user.id,
        name:    user.name,
        email:   user.email,
        empRole: user.role,
        dept:    user.dept,
      },
    });

  } catch (err) {
    console.error('[POST /api/auth/employee-login]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  return res.json({ user: req.session.user });
});

// ── POST /api/auth/signout ─────────────────────────────────
router.post('/signout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('[POST /api/auth/signout]', err);
      return res.status(500).json({ error: 'Could not sign out.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

module.exports = router;