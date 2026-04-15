// routes/auth.js
// Handles: send-otp, verify-otp, employee-login, logout, session check
require('dotenv').config();
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const https   = require('https');
const db      = require('../db');
const { sendOTPEmail } = require('../mailer');

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Validate phone number format.
 * PH (+63): 10 digits starting with 9
 * JP (+81): 10–11 digits
 */
function validatePhone(country, number) {
  const digits = number.replace(/\D/g, '');
  if (country === '+63') return /^9\d{9}$/.test(digits);
  if (country === '+81') return /^\d{10,11}$/.test(digits);
  return false;
}

/**
 * Check if an email is on any cPanel mailing list for the domain.
 * Uses the cPanel UAPI via HTTPS.
 * In production, the cPanel server is the same host as the app.
 */
async function isOnCpanelMailingList(email) {
  return new Promise((resolve) => {
    const host  = process.env.CPANEL_HOST  || 'omtpi.com.ph';
    const port  = process.env.CPANEL_PORT  || 2083;
    const user  = process.env.CPANEL_USER;
    const token = process.env.CPANEL_API_TOKEN;

    if (!user || !token) {
      console.warn('[cPanel] CPANEL_USER or CPANEL_API_TOKEN not set — skipping list check');
      return resolve(false);
    }

    const opts = {
      hostname: host,
      port,
      path:     `/execute/Email/list_lists?domain=${host.replace(/^mail\./, '')}`,
      method:   'GET',
      headers: {
        Authorization: `cpanel ${user}:${token}`,
      },
      rejectUnauthorized: false, // cPanel may use self-signed certs
    };

    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json  = JSON.parse(raw);
          const lists = (json.data || []).map(l => l.list + '@omtpi.com.ph');
          resolve(lists.map(e => e.toLowerCase()).includes(email.toLowerCase()));
        } catch (e) {
          console.error('[cPanel] Parse error:', e.message);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[cPanel] Request error:', err.message);
      resolve(false);
    });

    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/send-otp
//  Body: { country: '+63'|'+81', phone: '9171234567' }
// ─────────────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { country, phone } = req.body;

    if (!country || !phone) {
      return res.status(400).json({ error: 'country and phone are required' });
    }
    if (!['+63', '+81'].includes(country)) {
      return res.status(400).json({ error: 'Only Philippine (+63) and Japanese (+81) numbers are accepted' });
    }
    if (!validatePhone(country, phone)) {
      return res.status(400).json({ error: 'Invalid phone number format for selected country' });
    }

    const fullPhone = country + phone.replace(/\D/g, '');

    // Check 1-hour cooldown
    const [coolRows] = await db.query(
      'SELECT submitted_at FROM ticket_cooldowns WHERE phone = ?',
      [fullPhone]
    );
    if (coolRows.length) {
      const elapsed   = Date.now() - new Date(coolRows[0].submitted_at).getTime();
      const remaining = 60 * 60 * 1000 - elapsed;
      if (remaining > 0) {
        return res.status(429).json({
          error:     'cooldown',
          remaining, // milliseconds
          message:   'You have already submitted a ticket within the last hour.',
        });
      }
    }

    // Generate OTP and store it
    const otp     = generateOTP();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5-minute window

    await db.query('DELETE FROM otp_codes WHERE phone = ?', [fullPhone]);
    await db.query(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, ?)',
      [fullPhone, otp, expires]
    );

    // ── SMS Gateway ────────────────────────────────────────────
    // TODO: Replace console.log with SMS API call.
    // Example for Semaphore (PH):
    //   const semaphore = require('semaphore-sms');
    //   await semaphore.send({ number: fullPhone, message: `Your OMTPI OTP: ${otp}`, sendername: 'OMTPI' });
    //
    // Example for Twilio (global):
    //   const twilio = require('twilio')(SID, TOKEN);
    //   await twilio.messages.create({ body: `OMTPI OTP: ${otp}`, from: '+1XXXXXXXXXX', to: fullPhone });
    // ──────────────────────────────────────────────────────────

    console.log(`[OTP] ${fullPhone} → ${otp} (expires ${expires.toISOString()})`);

    return res.json({
      success: true,
      // Remove dev_otp in production — for demo purposes only
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
      return res.status(401).json({ error: 'OTP not found or has expired. Please request a new one.' });
    }
    if (rows[0].code !== String(code).trim()) {
      return res.status(401).json({ error: 'Incorrect OTP. Please try again.' });
    }

    // Mark OTP as used
    await db.query('UPDATE otp_codes SET used = 1 WHERE id = ?', [rows[0].id]);

    // Create session
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
// ─────────────────────────────────────────────────────────────
router.post('/employee-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const lower = email.toLowerCase().trim();

    // Gate 1: domain check
    const isCompanyEmail = lower.endsWith('@omtpi.com.ph');

    // Gate 2: cPanel mailing list check (for non-@omtpi.com.ph but registered emails)
    let passedGate = isCompanyEmail;
    if (!passedGate) {
      passedGate = await isOnCpanelMailingList(lower);
    }

    if (!passedGate) {
      return res.status(403).json({
        error: 'Access denied. Only @omtpi.com.ph addresses or registered cPanel mailboxes are allowed.',
      });
    }

    // Gate 3: DB lookup
    const [rows] = await db.query(
      'SELECT * FROM employees WHERE email = ? AND active = 1 LIMIT 1',
      [lower]
    );

    if (!rows.length) {
      return res.status(401).json({
        error: 'No active employee account found for this email address.',
      });
    }

    // Gate 4: password check
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // All gates passed — create session
    req.session.user = {
      role:  'employee',
      id:    rows[0].id,
      name:  rows[0].name,
      email: rows[0].email,
      dept:  rows[0].dept,
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
//  GET /api/auth/session  — check if user is logged in
// ─────────────────────────────────────────────────────────────
router.get('/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

module.exports = router;
