require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// EMPLOYEE LOGIN (DATABASE BASED)
router.post('/employee-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const lower = email.toLowerCase().trim();

    const [rows] = await db.query(
      'SELECT * FROM employees WHERE email = ? AND active = 1',
      [lower]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid account or account is inactive.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    // Store full session so both requireEmployee and requireAdmin work correctly
    req.session.user = {
      id:      user.id,
      name:    user.name,
      email:   user.email,
      role:    'employee',   // top-level role = "employee" (logged-in staff)
      empRole: user.role,    // empRole = actual rank: 'admin' | 'agent' | 'viewer'
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
      }
    });

  } catch (err) {
    console.error('[POST /auth/employee-login]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET CURRENT SESSION
router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  return res.json({ user: req.session.user });
});

// SIGN OUT
router.post('/signout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Could not sign out.' });
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

module.exports = router;
