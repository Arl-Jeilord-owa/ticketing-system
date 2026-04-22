const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendMail } = require('../mailer');

function requireEmployee(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'employee') {
    return res.status(403).json({ error: 'Employee access required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.empRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

const DEPARTMENT_MAP = {
  'Admin - HR': ['Admin - HR'],
  'Admin - FU': ['Admin - FU'],
  'MD - Network Management': ['MD - Network Management'],
  'Maintenance (MD)': ['Maintenance (MD)'],
  'General Office (GO)': ['General Office (GO)'],
  'Technical Service (TS)': ['Technical Service (TS)'],
  'Engineering (ED)': ['Engineering (ED)'],
  'Planning & Design (PD)': ['Planning & Design (PD)'],
  'Warehouse (WH)': ['Warehouse (WH)'],
  'Sales': ['Sales'],
  'IQS': ['IQS'],
  'Purchasing (PU)': ['Purchasing (PU)'],
  'Accounting': ['Accounting']
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getRecipients({ mode, department, recipients }) {
  if (mode === 'department') {
    const deptList = DEPARTMENT_MAP[department] || [department];

    const [rows] = await db.query(
      `SELECT id, name, email, role, dept
       FROM employees
       WHERE active = 1
         AND dept IN (?)
       ORDER BY name ASC`,
      [deptList]
    );

    return rows;
  }

  if (mode === 'active_agents_admins') {
    const [rows] = await db.query(
      `SELECT id, name, email, role, dept
       FROM employees
       WHERE active = 1
         AND role IN ('admin','agent')
       ORDER BY name ASC`
    );

    return rows;
  }

  if (mode === 'custom') {
    const list = Array.isArray(recipients)
      ? recipients
      : String(recipients || '')
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);

    if (!list.length) return [];

    const [rows] = await db.query(
      `SELECT id, name, email, role, dept
       FROM employees
       WHERE active = 1
         AND email IN (?)
       ORDER BY name ASC`,
      [list]
    );

    return rows;
  }

  return [];
}

// ── SEND MAIL ─────────────────────────────────────

router.post('/send', requireAdmin, async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { mode, department, recipients, subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }

    if (!['department', 'active_agents_admins', 'custom'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mail mode.' });
    }

    const baseRecipients = await getRecipients({ mode, department, recipients });

    if (!baseRecipients.length) {
      return res.status(400).json({ error: 'No active recipients found.' });
    }

    await conn.beginTransaction();

    const [messageResult] = await conn.query(
      `INSERT INTO mail_messages
       (sender_employee_id, subject, body_html, target_mode, target_label)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        subject.trim(),
        `
          <!DOCTYPE html>
          <html>
          <body style="font-family:Arial,sans-serif;padding:24px;color:#1a1a18;line-height:1.6;">
            <h2 style="margin:0 0 12px;">OMTPI HelpDesk</h2>
            <div style="white-space:pre-wrap;">${escapeHtml(message.trim())}</div>
            <hr style="border:none;border-top:1px solid #e0e0dd;margin:24px 0;">
            <p style="font-size:12px;color:#777;margin:0;">
              Sent by ${escapeHtml(req.session.user.name)} (${escapeHtml(req.session.user.email)})
            </p>
          </body>
          </html>
        `,
        mode,
        mode === 'department' ? department : mode === 'active_agents_admins' ? 'Active Agents/Admins' : 'Custom'
      ]
    );

    const mailMessageId = messageResult.insertId;

    for (const emp of baseRecipients) {
      await sendMail(
        emp.email,
        subject.trim(),
        `
          <!DOCTYPE html>
          <html>
          <body style="font-family:Arial,sans-serif;padding:24px;color:#1a1a18;line-height:1.6;">
            <h2 style="margin:0 0 12px;">OMTPI HelpDesk</h2>
            <div style="white-space:pre-wrap;">${escapeHtml(message.trim())}</div>
            <hr style="border:none;border-top:1px solid #e0e0dd;margin:24px 0;">
            <p style="font-size:12px;color:#777;margin:0;">
              Sent by ${escapeHtml(req.session.user.name)} (${escapeHtml(req.session.user.email)})
            </p>
          </body>
          </html>
        `
      );

      await conn.query(
        `INSERT INTO mail_recipients
         (mail_message_id, recipient_employee_id, recipient_email, recipient_name, recipient_role, recipient_dept, delivery_type, status, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, 'direct', 'sent', NOW())`,
        [mailMessageId, emp.id, emp.email, emp.name, emp.role, emp.dept]
      );

      const [forwardRules] = await conn.query(
        `SELECT f.target_employee_id, e.email, e.name, e.role, e.dept
         FROM mail_forwarding_rules f
         INNER JOIN employees e ON e.id = f.target_employee_id
         WHERE f.source_employee_id = ?
           AND f.active = 1
           AND e.active = 1`,
        [emp.id]
      );

      for (const fw of forwardRules) {
        await sendMail(
          fw.email,
          `[FWD] ${subject.trim()}`,
          `
            <!DOCTYPE html>
            <html>
            <body style="font-family:Arial,sans-serif;padding:24px;color:#1a1a18;line-height:1.6;">
              <p style="font-size:12px;color:#777;">Forwarded from ${escapeHtml(emp.name)} (${escapeHtml(emp.email)})</p>
              <h2 style="margin:0 0 12px;">OMTPI HelpDesk</h2>
              <div style="white-space:pre-wrap;">${escapeHtml(message.trim())}</div>
              <hr style="border:none;border-top:1px solid #e0e0dd;margin:24px 0;">
              <p style="font-size:12px;color:#777;margin:0;">
                Original sender: ${escapeHtml(req.session.user.name)} (${escapeHtml(req.session.user.email)})
              </p>
            </body>
            </html>
          `
        );

        await conn.query(
          `INSERT INTO mail_recipients
           (mail_message_id, recipient_employee_id, recipient_email, recipient_name, recipient_role, recipient_dept, delivery_type, forwarded_to_employee_id, status, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, 'forwarded', ?, 'sent', NOW())`,
          [mailMessageId, emp.id, emp.email, emp.name, emp.role, emp.dept, fw.target_employee_id]
        );
      }
    }

    await conn.commit();

    return res.json({
      success: true,
      message: 'Mail sent successfully.',
      sentCount: baseRecipients.length
    });
  } catch (err) {
    await conn.rollback();
    console.error('[POST /api/mail/send]', err);
    return res.status(500).json({ error: 'Failed to send mail.' });
  } finally {
    conn.release();
  }
});

// ── ADMIN: SET FORWARDING ────────────────────────

router.get('/forwarding', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         f.id,
         f.source_employee_id,
         src.name AS source_name,
         src.email AS source_email,
         f.target_employee_id,
         dst.name AS target_name,
         dst.email AS target_email,
         f.active,
         f.created_at,
         f.updated_at
       FROM mail_forwarding_rules f
       INNER JOIN employees src ON src.id = f.source_employee_id
       INNER JOIN employees dst ON dst.id = f.target_employee_id
       ORDER BY src.name ASC`
    );

    return res.json({ forwarding: rows });
  } catch (err) {
    console.error('[GET /api/mail/forwarding]', err);
    return res.status(500).json({ error: 'Failed to load forwarding rules.' });
  }
});

router.post('/forwarding', requireAdmin, async (req, res) => {
  try {
    const { sourceEmployeeId, targetEmployeeId, active = true } = req.body;

    if (!sourceEmployeeId || !targetEmployeeId) {
      return res.status(400).json({ error: 'Source and target employee are required.' });
    }

    if (Number(sourceEmployeeId) === Number(targetEmployeeId)) {
      return res.status(400).json({ error: 'Source and target employee cannot be the same.' });
    }

    await db.query(
      `INSERT INTO mail_forwarding_rules
       (source_employee_id, target_employee_id, active, created_by_employee_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         target_employee_id = VALUES(target_employee_id),
         active = VALUES(active),
         created_by_employee_id = VALUES(created_by_employee_id),
         updated_at = CURRENT_TIMESTAMP`,
      [sourceEmployeeId, targetEmployeeId, active ? 1 : 0, req.session.user.id]
    );

    return res.json({ success: true, message: 'Forwarding rule saved.' });
  } catch (err) {
    console.error('[POST /api/mail/forwarding]', err);
    return res.status(500).json({ error: 'Failed to save forwarding rule.' });
  }
});

// ── ADMIN: STATS ─────────────────────────────────

router.get('/stats/departments', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         COALESCE(recipient_dept, 'Unassigned') AS department,
         COUNT(*) AS sent_count
       FROM mail_recipients
       WHERE status = 'sent'
       GROUP BY recipient_dept
       ORDER BY sent_count DESC, department ASC`
    );

    return res.json({ stats: rows });
  } catch (err) {
    console.error('[GET /api/mail/stats/departments]', err);
    return res.status(500).json({ error: 'Failed to load department stats.' });
  }
});

router.get('/stats/roles', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         COALESCE(recipient_role, 'unknown') AS role,
         COUNT(*) AS sent_count
       FROM mail_recipients
       WHERE status = 'sent'
       GROUP BY recipient_role
       ORDER BY sent_count DESC, role ASC`
    );

    return res.json({ stats: rows });
  } catch (err) {
    console.error('[GET /api/mail/stats/roles]', err);
    return res.status(500).json({ error: 'Failed to load role stats.' });
  }
});

// ── EMPLOYEE/AGENT MAILBOX WITH SEARCH ─────────────────────

router.get('/mailbox', requireEmployee, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const archived = req.query.archived === '1';

    let sql = `
      SELECT
        mr.id,
        mr.is_read,
        mr.read_at,
        mr.is_archived,
        mr.archived_at,
        mm.subject,
        mm.body_html,
        mm.created_at,
        mr.delivery_type,
        mr.recipient_email,
        mr.recipient_name,
        mr.recipient_role,
        mr.recipient_dept,
        sender.name AS sender_name,
        sender.email AS sender_email,
        fwd.name AS forwarded_to_name
      FROM mail_recipients mr
      INNER JOIN mail_messages mm ON mm.id = mr.mail_message_id
      INNER JOIN employees sender ON sender.id = mm.sender_employee_id
      LEFT JOIN employees fwd ON fwd.id = mr.forwarded_to_employee_id
      WHERE mr.status = 'sent'
        AND (
          mr.recipient_employee_id = ?
          OR mr.forwarded_to_employee_id = ?
        )
        AND mr.is_archived = ?
    `;

    const params = [req.session.user.id, req.session.user.id, archived ? 1 : 0];

    if (q) {
      sql += `
        AND (
          mm.subject LIKE ?
          OR sender.name LIKE ?
          OR sender.email LIKE ?
          OR mr.recipient_dept LIKE ?
        )
      `;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    sql += ` ORDER BY mr.is_read ASC, mm.created_at DESC, mr.id DESC`;

    const [rows] = await db.query(sql, params);

    return res.json({ messages: rows });
  } catch (err) {
    console.error('[GET /api/mail/mailbox]', err);
    return res.status(500).json({ error: 'Failed to load mailbox.' });
  }
});

// ── MARK AS READ ────────────────────────────────────────────

router.patch('/mailbox/:id/read', requireEmployee, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE mail_recipients
       SET is_read = 1,
           read_at = NOW()
       WHERE id = ?
         AND (
           recipient_employee_id = ?
           OR forwarded_to_employee_id = ?
         )`,
      [req.params.id, req.session.user.id, req.session.user.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Mail item not found.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/mail/mailbox/:id/read]', err);
    return res.status(500).json({ error: 'Failed to mark mail as read.' });
  }
});

// ── MARK AS UNREAD ──────────────────────────────────────────

router.patch('/mailbox/:id/unread', requireEmployee, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE mail_recipients
       SET is_read = 0,
           read_at = NULL
       WHERE id = ?
         AND (
           recipient_employee_id = ?
           OR forwarded_to_employee_id = ?
         )`,
      [req.params.id, req.session.user.id, req.session.user.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Mail item not found.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/mail/mailbox/:id/unread]', err);
    return res.status(500).json({ error: 'Failed to mark mail as unread.' });
  }
});

// ── ARCHIVE MAIL ────────────────────────────────────────────

router.patch('/mailbox/:id/archive', requireEmployee, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE mail_recipients
       SET is_archived = 1,
           archived_at = NOW()
       WHERE id = ?
         AND (
           recipient_employee_id = ?
           OR forwarded_to_employee_id = ?
         )`,
      [req.params.id, req.session.user.id, req.session.user.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Mail item not found.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/mail/mailbox/:id/archive]', err);
    return res.status(500).json({ error: 'Failed to archive mail.' });
  }
});

// ── UNARCHIVE MAIL ──────────────────────────────────────────

router.patch('/mailbox/:id/unarchive', requireEmployee, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE mail_recipients
       SET is_archived = 0,
           archived_at = NULL
       WHERE id = ?
         AND (
           recipient_employee_id = ?
           OR forwarded_to_employee_id = ?
         )`,
      [req.params.id, req.session.user.id, req.session.user.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Mail item not found.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/mail/mailbox/:id/unarchive]', err);
    return res.status(500).json({ error: 'Failed to unarchive mail.' });
  }
});

// ── EMPLOYEE/AGENT MAILBOX ───────────────────────

router.get('/mailbox', requireEmployee, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         mr.id,
         mm.subject,
         mm.body_html,
         mm.created_at,
         mr.delivery_type,
         mr.recipient_email,
         mr.recipient_name,
         mr.recipient_role,
         mr.recipient_dept,
         sender.name AS sender_name,
         sender.email AS sender_email,
         fwd.name AS forwarded_to_name
       FROM mail_recipients mr
       INNER JOIN mail_messages mm ON mm.id = mr.mail_message_id
       INNER JOIN employees sender ON sender.id = mm.sender_employee_id
       LEFT JOIN employees fwd ON fwd.id = mr.forwarded_to_employee_id
       WHERE mr.status = 'sent'
         AND (
           mr.recipient_employee_id = ?
           OR mr.forwarded_to_employee_id = ?
         )
       ORDER BY mm.created_at DESC, mr.id DESC`,
      [req.session.user.id, req.session.user.id]
    );

    return res.json({ messages: rows });
  } catch (err) {
    console.error('[GET /api/mail/mailbox]', err);
    return res.status(500).json({ error: 'Failed to load mailbox.' });
  }
});

module.exports = router;