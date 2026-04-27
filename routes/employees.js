// routes/employees.js — CRUD for employee accounts (admin-managed)
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');

// ── Middleware ─────────────────────────────────────────────

/** Any logged-in staff member */
function requireEmployee(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'employee') {
    return res.status(403).json({ error: 'Login required.' });
  }
  next();
}

/** Admin-rank staff only */
function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.empRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ── GET /api/employees ─────────────────────────────────────
router.get('/', requireEmployee, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, role, dept, active, created_at
       FROM employees
       ORDER BY name ASC`
    );
    return res.json({ employees: rows });
  } catch (err) {
    console.error('[GET /api/employees]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/employees ────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role = 'agent', dept } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required.' });
    }

    const lower = email.toLowerCase().trim();

    if (!lower.endsWith('@omtpi.com.ph')) {
      return res.status(400).json({ error: 'Email must end in @omtpi.com.ph' });
    }

    const [existing] = await db.query(
      'SELECT id FROM employees WHERE email = ? LIMIT 1',
      [lower]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO employees (name, email, password, role, dept) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), lower, hash, role, dept || null]
    );

    return res.status(201).json({ success: true, id: result.insertId });

  } catch (err) {
    console.error('[POST /api/employees]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── PATCH /api/employees/:id ───────────────────────────────
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, role, dept, active } = req.body;
    const fields = [];
    const values = [];

    if (name   !== undefined) { fields.push('name = ?');   values.push(name.trim()); }
    if (role   !== undefined) { fields.push('role = ?');   values.push(role); }
    if (dept   !== undefined) { fields.push('dept = ?');   values.push(dept || null); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }

    if (!fields.length) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    values.push(req.params.id);

    const [result] = await db.query(
      `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('[PATCH /api/employees/:id]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── PATCH /api/employees/:id/password ─────────────────────
router.patch('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'UPDATE employees SET password = ? WHERE id = ?',
      [hash, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('[PATCH /api/employees/:id/password]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── DELETE /api/employees/:id ──────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.session.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const [result] = await db.query(
      'DELETE FROM employees WHERE id = ?',
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/employees/:id]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;