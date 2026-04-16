require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const Auth = {
  handleSignOut() {
    location.reload();
  },
  getRemainingCooldown() {
    return 0;
  },
  formatCooldownTime(ms) {
    return Math.ceil(ms / 1000) + 's';
  }
};

// EMPLOYEE LOGIN (DATABASE BASED)
router.post('/employee-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.query(
      'SELECT * FROM employees WHERE email = ? AND active = 1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid account' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    req.session.user = {
      id: user.id,
      role: 'employee',
      email: user.email
    };

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;