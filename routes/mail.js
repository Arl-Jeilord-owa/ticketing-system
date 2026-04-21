const express = require('express');
const router = express.Router();
const { sendMail } = require('../mailer');
const db = require('../db');

function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.empRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

router.post('/send', requireAdmin, async (req, res) => {
  try {
    let { recipients, subject, message, sendToAll } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }

    subject = String(subject).trim();
    message = String(message).trim();

    let recipientList = [];

    if (sendToAll) {
      const [rows] = await db.query(
        `SELECT email
         FROM employees
         WHERE active = 1
         ORDER BY name ASC`
      );

      recipientList = rows.map(row => row.email).filter(Boolean);
    } else {
      if (!recipients) {
        return res.status(400).json({ error: 'Recipients are required.' });
      }

      if (Array.isArray(recipients)) {
        recipientList = recipients;
      } else {
        recipientList = String(recipients)
          .split(',')
          .map(email => email.trim())
          .filter(Boolean);
      }
    }

    recipientList = [...new Set(recipientList.map(email => email.toLowerCase()))];

    if (!recipientList.length) {
      return res.status(400).json({ error: 'No valid recipients found.' });
    }

    const invalid = recipientList.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid email(s): ${invalid.join(', ')}` });
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family:Arial,sans-serif;padding:24px;color:#1a1a18;line-height:1.6;">
        <h2 style="margin:0 0 12px;">OMTPI HelpDesk</h2>
        <div style="white-space:pre-wrap;">${escapeHtml(message)}</div>
        <hr style="border:none;border-top:1px solid #e0e0dd;margin:24px 0;">
        <p style="font-size:12px;color:#777;margin:0;">
          Sent by ${escapeHtml(req.session.user.name)} (${escapeHtml(req.session.user.email)})
        </p>
      </body>
      </html>
    `;

    await sendMail(recipientList.join(','), subject, html);

    return res.json({
      success: true,
      message: 'Mail sent successfully.',
      sentCount: recipientList.length
    });

  } catch (err) {
    console.error('[POST /api/mail/send]', err);
    return res.status(500).json({ error: 'Failed to send mail.' });
  }
});

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;