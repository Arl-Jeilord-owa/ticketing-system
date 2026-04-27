// routes/tickets.js — Ticket CRUD (employee-facing)
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { sendTicketConfirmation } = require('../mailer');

// ── Middleware ─────────────────────────────────────────────

function requireEmployee(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'employee') {
    return res.status(403).json({ error: 'Login required.' });
  }
  next();
}

// ── Helper: generate next ticket number ───────────────────
async function nextTicketNo() {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM tickets');
  return 'TK-' + String(rows[0].cnt + 1).padStart(4, '0');
}

// ── GET /api/tickets/summary ───────────────────────────────
router.get('/summary', requireEmployee, async (req, res) => {
  try {
    const [[row]] = await db.query(`
      SELECT
        SUM(status = 'open')                                    AS open_count,
        SUM(status = 'progress')                                AS progress_count,
        SUM(status IN ('resolved','closed'))                    AS resolved_count,
        SUM(priority = 'critical' AND status = 'open')         AS critical_count
      FROM tickets
    `);
    return res.json({
      open:     row.open_count     || 0,
      progress: row.progress_count || 0,
      resolved: row.resolved_count || 0,
      critical: row.critical_count || 0,
    });
  } catch (err) {
    console.error('[GET /api/tickets/summary]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/tickets ───────────────────────────────────────
router.get('/', requireEmployee, async (req, res) => {
  try {
    const { view, status, q } = req.query;
    let sql    = 'SELECT * FROM tickets WHERE 1=1';
    const args = [];

    if (view === 'internal') { sql += ' AND type = ?';            args.push('internal'); }
    if (view === 'external') { sql += ' AND type = ?';            args.push('external'); }
    if (view === 'resolved') { sql += ' AND status IN (?,?)';     args.push('resolved', 'closed'); }
    if (view === 'all')      { sql += ' AND status NOT IN (?,?)'; args.push('resolved', 'closed'); }

    if (status && status !== 'all') { sql += ' AND status = ?'; args.push(status); }

    if (q) {
      sql += ' AND (ticket_no LIKE ? OR subject LIKE ? OR requester LIKE ?)';
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY updated_at DESC';

    const [rows] = await db.query(sql, args);
    return res.json({ tickets: rows });

  } catch (err) {
    console.error('[GET /api/tickets]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/tickets/by-no/:ticketNo ──────────────────────
router.get('/by-no/:ticketNo', requireEmployee, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM tickets WHERE ticket_no = ? LIMIT 1',
      [req.params.ticketNo]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const [comments] = await db.query(
      'SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC',
      [rows[0].id]
    );

    return res.json({ ticket: rows[0], comments });

  } catch (err) {
    console.error('[GET /api/tickets/by-no/:ticketNo]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/tickets ──────────────────────────────────────
router.post('/', requireEmployee, async (req, res) => {
  try {
    const { type, dept, subject, description, priority, requester, email, assignee } = req.body;

    if (!subject || !requester) {
      return res.status(400).json({ error: 'subject and requester are required.' });
    }

    const ticketNo = await nextTicketNo();

    await db.query(
      `INSERT INTO tickets
         (ticket_no, type, dept, subject, description, priority, requester, email, assignee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketNo,
        type       || 'internal',
        dept       || 'General',
        subject,
        description || '',
        priority   || 'medium',
        requester,
        email      || null,
        assignee   || 'Unassigned',
      ]
    );

    if (email) {
      sendTicketConfirmation(email, ticketNo, subject).catch(err =>
        console.error('[Mailer] Confirmation failed:', err.message)
      );
    }

    return res.status(201).json({ success: true, ticketNo });

  } catch (err) {
    console.error('[POST /api/tickets]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── PATCH /api/tickets/:ticketNo/status ───────────────────
router.patch('/:ticketNo/status', requireEmployee, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['open', 'progress', 'resolved', 'closed'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const [result] = await db.query(
      'UPDATE tickets SET status = ? WHERE ticket_no = ?',
      [status, req.params.ticketNo]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('[PATCH /api/tickets/:ticketNo/status]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/tickets/:ticketNo/comments ──────────────────
router.post('/:ticketNo/comments', requireEmployee, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Comment body is required.' });

    const [rows] = await db.query(
      'SELECT id FROM tickets WHERE ticket_no = ? LIMIT 1',
      [req.params.ticketNo]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const author = req.session.user.name || req.session.user.email;

    await db.query(
      'INSERT INTO comments (ticket_id, author, body) VALUES (?, ?, ?)',
      [rows[0].id, author, body]
    );

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error('[POST /api/tickets/:ticketNo/comments]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;