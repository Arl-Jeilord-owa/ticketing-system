const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// CREATE TICKET
router.post('/', requireAuth, async (req, res) => {
  try {
    const { subject, description, priority } = req.body;

    const [count] = await db.query('SELECT COUNT(*) AS cnt FROM tickets');
    const ticketNo = 'TK-' + String(count[0].cnt + 1).padStart(4, '0');

    await db.query(
      `INSERT INTO tickets (ticket_no, subject, description, priority, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [ticketNo, subject, description, priority || 'medium']
    );

    res.json({ success: true, ticketNo });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET ALL TICKETS
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tickets ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;