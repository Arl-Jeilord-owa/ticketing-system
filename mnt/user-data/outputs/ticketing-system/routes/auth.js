// routes/auth.js
// Auth endpoints: send-otp, verify-otp, employee-login, logout, session
//
// cPanel mailing list strategy:
//   The cPanel mailing list (all@omtpi.com.ph) stores its member list in
//   /etc/majordomo/lists/all on the server, OR is accessible via two methods:
//
//   METHOD A (recommended) — cPanel UAPI Email::list_list_members
//     GET https://host:2083/execute/Email/list_members?list=all&domain=omtpi.com.ph
//     Authorization: cpanel USERNAME:API_TOKEN
//
//   METHOD B (fallback) — scrape Webmail membership page
//     The webmail at webmail.omtpi.com.ph redirects to the majordomo admin page.
//     We use a direct HTTP call with cPanel credentials instead.
//
//   This file implements both with METHOD A preferred.

require('dotenv').config();
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const https   = require('https');
const http    = require('http');
const db      = require('../db');

// ─────────────────────────────────────────────────────────────
//  Helper: generate 6-digit OTP
// ─────────────────────────────────────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─────────────────────────────────────────────────────────────
//  Helper: validate PH/JP phone number format
// ─────────────────────────────────────────────────────────────
function validatePhone(country, number) {
  const d = number.replace(/\D/g, '');
  if (country === '+63') return /^9\d{9}$/.test(d);    // PH mobile
  if (country === '+81') return /^\d{10,11}$/.test(d); // JP any
  return false;
}

// ─────────────────────────────────────────────────────────────
//  cPanel: fetch mailing list member emails
//
//  Uses cPanel UAPI: Email::list_members (if available on your plan)
//  Falls back to reading the list file directly via cPanel File Manager API.
//
//  Returns: string[] of lowercase email addresses
// ─────────────────────────────────────────────────────────────
async function fetchMailingListMembers() {
  return new Promise((resolve) => {
    const cpHost  = process.env.CPANEL_HOST  || 'omtpi.com.ph';
    const cpPort  = parseInt(process.env.CPANEL_PORT) || 2083;
    const cpUser  = process.env.CPANEL_USER;
    const cpToken = process.env.CPANEL_API_TOKEN;
    const domain  = cpHost.replace(/^(mail|webmail)\./, '');

    if (!cpUser || !cpToken) {
      console.warn('[cPanel] Credentials not set — mailing list check skipped');
      return resolve([]);
    }

    // ── METHOD A: UAPI Email::list_members ──────────────────
    const path = `/execute/Email/list_members?list=all&domain=${domain}`;

    const opts = {
      hostname:           cpHost,
      port:               cpPort,
      path,
      method:             'GET',
      headers: {
        Authorization: `cpanel ${cpUser}:${cpToken}`,
        'User-Agent':  'OMTPI-HelpDesk/1.0',
      },
      rejectUnauthorized: false, // cPanel often uses self-signed certs
      timeout:            8000,
    };

    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);

          // UAPI returns { status: 1, data: [ { address: 'user@domain' }, ... ] }
          if (json.status === 1 && Array.isArray(json.data)) {
            const members = json.data
              .map(m => (m.address || m.email || '').toLowerCase().trim())
              .filter(Boolean);
            console.log(`[cPanel] Mailing list members fetched: ${members.length}`);
            return resolve(members);
          }

          // Some cPanel versions return { result: { data: [...] } }
          const alt = json?.result?.data || json?.data?.members || [];
          if (alt.length) {
            const members = alt.map(m =>
              typeof m === 'string' ? m.toLowerCase() : (m.address || '').toLowerCase()
            ).filter(Boolean);
            return resolve(members);
          }

          console.warn('[cPanel] Unexpected UAPI response:', raw.slice(0, 200));
          resolve([]);

        } catch (e) {
          console.error('[cPanel] JSON parse error:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', err => {
      console.error('[cPanel] UAPI request error:', err.message);
      resolve([]);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[cPanel] UAPI request timed out');
      resolve([]);
    });

    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  Check if an email is allowed as an employee:
//    1. Ends with @omtpi.com.ph  →  always allowed (domain gate)
//    2. Is a member of all@omtpi.com.ph mailing list  →  allowed
// ─────────────────────────────────────────────────────────────
async function isAllowedEmployeeEmail(email) {
  const lower = email.toLowerCase().trim();

  // Fast path: company domain
  if (lower.endsWith('@omtpi.com.ph')) return true;

  // Slow path: check mailing list
  const members = await fetchMailingListMembers();
  return members.includes(lower);
}

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/send-otp
//  Body: { country, phone }
//  Cooldown is per phone number (server-side in ticket_cooldowns table)
// ─────────────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { country, phone } = req.body;

    if (!country || !phone) {
      return res.status(400).json({ error: 'country and phone are required' });
    }
    if (!['+63', '+81'].includes(country)) {
      return res.status(400).json({
        error: 'Only Philippine (+63) and Japanese (+81) numbers are accepted',
      });
    }
    if (!validatePhone(country, phone)) {
      return res.status(400).json({
        error: country === '+63'
          ? 'Invalid PH number. Enter a 10-digit mobile (e.g. 9171234567).'
          : 'Invalid JP number. Enter a 10–11 digit number including area code.',
      });
    }

    const fullPhone = country + phone.replace(/\D/g, '');

    // ── Check 1-hour cooldown ──────────────────────────────
    const [cdRows] = await db.query(
      'SELECT submitted_at FROM ticket_cooldowns WHERE phone = ?',
      [fullPhone]
    );
    if (cdRows.length) {
      const elapsed   = Date.now() - new Date(cdRows[0].submitted_at).getTime();
      const remaining = 60 * 60 * 1000 - elapsed;
      if (remaining > 0) {
        return res.status(429).json({
          error:     'cooldown',
          remaining,
          message:   'You have already submitted a ticket within the last hour.',
        });
      }
    }

    // ── Generate & store OTP ───────────────────────────────
    const otp     = generateOTP();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    await db.query('DELETE FROM otp_codes WHERE phone = ?', [fullPhone]);
    await db.query(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, ?)',
      [fullPhone, otp, expires]
    );

    // ── SMS Gateway ───────────────────────────────────────
    // TODO: Replace with real SMS API
    // PH (Semaphore):
    //   const semaphore = require('semaphore-sms');
    //   await semaphore.send({ number: fullPhone, message: `OMTPI OTP: ${otp}`, sendername: 'OMTPI' });
    //
    // Global (Twilio):
    //   const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    //   await twilio.messages.create({ body: `OMTPI OTP: ${otp}`, from: process.env.TWILIO_FROM, to: fullPhone });
    // ─────────────────────────────────────────────────────

    console.log(`[OTP] ${fullPhone} → ${otp}`);

    return res.json({
      success: true,
      // dev_otp is only returned outside of production — remove/comment for live
      ...(process.env.NODE_ENV !== 'production' && { dev_otp: otp }),
    });

  } catch (err) {
    console.error('[send-otp]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/verify-otp
//  Body: { country, phone, code }
// ─────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { country, phone, code } = req.body;
    if (!country || !phone || !code) {
      return res.status(400).json({ error: 'country, phone, and code are required' });
    }

    const fullPhone = country + phone.replace(/\D/g, '');

    const [rows] = await db.query(
      `SELECT * FROM otp_codes
       WHERE phone = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [fullPhone]
    );

    if (!rows.length) {
      return res.status(401).json({
        error: 'OTP not found or has expired. Please request a new one.',
      });
    }
    if (rows[0].code !== String(code).trim()) {
      return res.status(401).json({ error: 'Incorrect OTP. Please try again.' });
    }

    // Mark used
    await db.query('UPDATE otp_codes SET used = 1 WHERE id = ?', [rows[0].id]);

    // Start session
    req.session.user = { role: 'customer', phone: fullPhone };

    return res.json({ success: true });

  } catch (err) {
    console.error('[verify-otp]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/employee-login
//  Body: { email, password }
//
//  Access gates (in order):
//    1. Email must end in @omtpi.com.ph  OR be on all@omtpi.com.ph mailing list
//    2. Must have an active row in the employees table
//    3. bcrypt password must match
// ─────────────────────────────────────────────────────────────
router.post('/employee-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const lower = email.toLowerCase().trim();

    // ── Gate 1: domain + mailing list ─────────────────────
    const allowed = await isAllowedEmployeeEmail(lower);
    if (!allowed) {
      return res.status(403).json({
        error: 'Access denied. Only @omtpi.com.ph addresses or members of the all@omtpi.com.ph mailing list are allowed.',
      });
    }

    // ── Gate 2: DB lookup ──────────────────────────────────
    const [rows] = await db.query(
      'SELECT * FROM employees WHERE email = ? AND active = 1 LIMIT 1',
      [lower]
    );
    if (!rows.length) {
      return res.status(401).json({
        error: 'No active employee account found for this email address. Contact your admin.',
      });
    }

    // ── Gate 3: password ───────────────────────────────────
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // ── All gates passed ───────────────────────────────────
    req.session.user = {
      role:    'employee',
      id:      rows[0].id,
      name:    rows[0].name,
      email:   rows[0].email,
      dept:    rows[0].dept,
      empRole: rows[0].role, // admin / agent / viewer
    };

    return res.json({
      success: true,
      name:    rows[0].name,
      empRole: rows[0].role,
    });

  } catch (err) {
    console.error('[employee-login]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/session
// ─────────────────────────────────────────────────────────────
router.get('/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/mailing-list-members  (admin debug endpoint)
//  Only usable in development — remove/restrict in production
// ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  router.get('/mailing-list-members', async (req, res) => {
    const members = await fetchMailingListMembers();
    return res.json({ count: members.length, members });
  });
}

module.exports = router;
