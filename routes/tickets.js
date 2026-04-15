// routes/tickets.js
// CRUD for tickets and comments. All routes require authentication.
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { sendTicketConfirmation, sendAgentNotification } = require('../mailer');

// ─────────────────────────────────────────────────────────────
//  Auth middleware
// ─────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireEmployee(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'employee') {
    return res.status(403).json({ error: 'Employee access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
//  Helper: generate next ticket number (TK-0001 format)
// ─────────────────────────────────────────────────────────────
async function nextTicketNo() {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM tickets');
  return 'TK-' + String(rows[0].cnt + 1).padStart(4, '0');
}

// ─────────────────────────────────────────────────────────────
//  POST /api/tickets
//  Anyone authenticated can submit a ticket.
//  Customers → external only, 1-hour cooldown enforced.
//  Employees → can set type freely.
// ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const {
      type, dept, subject, description,
      priority, requester, email, phone, assignee,
    } = req.body;

    if (!subject || !requester) {
      return res.status(400).json({ error: 'subject and requester are required' });
    }

    // Customers may only submit external tickets
    const ticketType = user.role === 'customer' ? 'external' : (type || 'external');

    // Cooldown check for customers
    if (user.role === 'customer') {
      const [cdRows] = await db.query(
        'SELECT submitted_at FROM ticket_cooldowns WHERE phone = ?',
        [user.phone]
      );
      if (cdRows.length) {
        const elapsed   = Date.now() - new Date(cdRows[0].submitted_at).getTime();
        const remaining = 60 * 60 * 1000 - elapsed;
        if (remaining > 0) {
          return res.status(429).json({
            error:     'cooldown',
            remaining,
            message:   'You can only submit one ticket per hour.',
          });
        }
      }
    }

    const ticketNo = await nextTicketNo();

    await db.query(
      `INSERT INTO tickets
        (ticket_no, type, dept, subject, description, priority, status, requester, email, phone, assignee)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      [
        ticketNo,
        ticketType,
        dept        || 'General',
        subject,
        description || '',
        priority    || 'medium',
        requester,
        email       || null,
        phone       || user.phone || null,
        assignee    || 'Unassigned',
      ]
    );

    // Set / refresh cooldown for customers
    if (user.role === 'customer') {
      await db.query(
        `INSERT INTO ticket_cooldowns (phone, submitted_at) VALUES (?, NOW())
         ON DUPLICATE KEY UPDATE submitted_at = NOW()`,
        [user.phone]
      );
    }

    // Send confirmation email to requester
    if (email) {
      sendTicketConfirmation(email, ticketNo, subject).catch(err =>
        console.error('[mailer] sendTicketConfirmation:', err.message)
      );
    }

    return res.json({ success: true, ticketNo });

  } catch (err) {
    console.error('[POST /tickets]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/tickets
//  Employees only. Query params: view, status, q (search)
// ─────────────────────────────────────────────────────────────
router.get('/', requireEmployee, async (req, res) => {
  try {
    const { view, status, q } = req.query;

    let sql  = 'SELECT * FROM tickets WHERE 1=1';
    const args = [];

    if (view === 'internal') { sql += ' AND type = ?';          args.push('internal'); }
    if (view === 'external') { sql += ' AND type = ?';          args.push('external'); }
    if (view === 'resolved') { sql += ' AND status IN (?,?)';   args.push('resolved', 'closed'); }
    if (view === 'all')      { sql += ' AND status NOT IN (?,?)'; args.push('resolved', 'closed'); }

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      args.push(status);
    }

    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      sql += ' AND (ticket_no LIKE ? OR subject LIKE ? OR requester LIKE ? OR dept LIKE ?)';
      args.push(like, like, like, like);
    }

    sql += ' ORDER BY updated_at DESC';

    const [rows] = await db.query(sql, args);
    return res.json({ tickets: rows });

  } catch (err) {
    console.error('[GET /tickets]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/tickets/summary  — dashboard stat counts
// ─────────────────────────────────────────────────────────────
router.get('/summary', requireEmployee, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        SUM(status = 'open')     AS open_count,
        SUM(status = 'progress') AS progress_count,
        SUM(status IN ('resolved','closed')) AS resolved_count,
        SUM(priority = 'critical' AND status = 'open') AS critical_count
      FROM tickets
    `);
    return res.json(rows[0]);
  } catch (err) {
    console.error('[GET /tickets/summary]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/tickets/:id  — single ticket + comments
// ─────────────────────────────────────────────────────────────
router.get('/:id', requireEmployee, async (req, res) => {
  try {
    const [ticketRows] = await db.query(
      'SELECT * FROM tickets WHERE id = ?', [req.params.id]
    );
    if (!ticketRows.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [comments] = await db.query(
      'SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticketRows[0].id]
    );

    return res.json({ ticket: ticketRows[0], comments });

  } catch (err) {
    console.error('[GET /tickets/:id]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/tickets/:id/status
//  Body: { status }
// ─────────────────────────────────────────────────────────────
router.patch('/:id/status', requireEmployee, async (req, res) => {
  try {
    const allowed = ['open', 'progress', 'resolved', 'closed'];
    const { status } = req.body;

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    await db.query(
      'UPDATE tickets SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error('[PATCH /tickets/:id/status]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/tickets/:id/assign
//  Body: { assignee }
// ─────────────────────────────────────────────────────────────
router.patch('/:id/assign', requireEmployee, async (req, res) => {
  try {
    const { assignee } = req.body;
    if (!assignee) return res.status(400).json({ error: 'assignee required' });

    await db.query(
      'UPDATE tickets SET assignee = ? WHERE id = ?',
      [assignee, req.params.id]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error('[PATCH /tickets/:id/assign]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/tickets/:id/comments
//  Body: { body }
// ─────────────────────────────────────────────────────────────
router.post('/:id/comments', requireEmployee, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body required' });

    const author = req.session.user.name || req.session.user.email;

    await db.query(
      'INSERT INTO comments (ticket_id, author, body) VALUES (?, ?, ?)',
      [req.params.id, author, body.trim()]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error('[POST /tickets/:id/comments]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
