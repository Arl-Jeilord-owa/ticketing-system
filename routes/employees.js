// routes/employees.js
// Admin-only endpoints for managing employee accounts.
// Admins can create, list, update, and deactivate employees.

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');

// ── Middleware: must be a logged-in employee ───────────────
function requireEmployee(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'employee') {
    return res.status(403).json({ error: 'Employee access required' });
  }
  next();
}

// ── Middleware: must be admin ──────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.empRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
//  GET /api/employees
//  List all employees (agents can see list but not passwords)
// ─────────────────────────────────────────────────────────────
router.get('/', requireEmployee, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, dept, active, created_at FROM employees ORDER BY name ASC'
    );
    return res.json({ employees: rows });
  } catch (err) {
    console.error('[GET /employees]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/employees
//  Create a new employee account (admin only)
//  Body: { name, email, password, role, dept }
// ─────────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role = 'agent', dept } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const lower = email.toLowerCase().trim();
    if (!lower.endsWith('@omtpi.com.ph')) {
      return res.status(400).json({ error: 'Employee email must end in @omtpi.com.ph' });
    }

    // Check for duplicate
    const [existing] = await db.query('SELECT id FROM employees WHERE email = ?', [lower]);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO employees (name, email, password, role, dept) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), lower, hash, role, dept || null]
    );

    return res.status(201).json({ success: true, message: `Employee ${lower} created.` });

  } catch (err) {
    console.error('[POST /employees]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/employees/:id
//  Update employee role, dept, or active status (admin only)
//  Body: { role?, dept?, active? }
// ─────────────────────────────────────────────────────────────
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { role, dept, active, name } = req.body;
    const fields = [];
    const values = [];

    if (role  !== undefined) { fields.push('role = ?');   values.push(role); }
    if (dept  !== undefined) { fields.push('dept = ?');   values.push(dept); }
    if (active!== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
    if (name  !== undefined) { fields.push('name = ?');   values.push(name.trim()); }

    if (!fields.length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    values.push(req.params.id);
    await db.query(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`, values);

    return res.json({ success: true });

  } catch (err) {
    console.error('[PATCH /employees/:id]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/employees/:id/reset-password
//  Admin resets an employee's password
//  Body: { newPassword }
// ─────────────────────────────────────────────────────────────
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password = ? WHERE id = ?', [hash, req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /employees/reset-password]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/employees/change-password
//  An employee changes their own password
//  Body: { currentPassword, newPassword }
// ─────────────────────────────────────────────────────────────
router.post('/change-password', requireEmployee, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const userId = req.session.user.id;
    const [rows] = await db.query('SELECT password FROM employees WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'Employee not found.' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password = ? WHERE id = ?', [hash, userId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /employees/change-password]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
