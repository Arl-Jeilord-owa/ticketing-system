# OMTPI HelpDesk — Full Setup Guide
### Node.js + Express + MySQL (cPanel) + Nodemailer + Dark/Light Mode

---

## Assumed Project Structure

```
helpdesk/
├── node_modules/
├── public/                  ← served statically by Express
│   ├── index.html
│   ├── assets/
│   │   └── support/
│   │       ├── bootstrap-5.3.8-dist/
│   │       └── js/
│   │           └── jquery-4.0.0.min.js
│   ├── css/
│   │   ├── variables.css
│   │   ├── theme.css        ← NEW (light/dark mode)
│   │   └── ... (all other css files)
│   └── js/
│       └── ... (all frontend js files)
├── server.js
├── .env                     ← NEW (never commit this)
├── .gitignore               ← NEW
├── db.js                    ← NEW (MySQL connection pool)
├── mailer.js                ← NEW (Nodemailer via cPanel SMTP)
├── routes/
│   ├── auth.js              ← NEW (API routes: OTP, employee login)
│   └── tickets.js           ← NEW (API routes: CRUD tickets)
└── package.json
```

---

## STEP 1 — Install remaining dependencies

Open **Git Bash** in VS Code and run:

```bash
npm install dotenv nodemailer express-session bcryptjs cors
```

What each package does:
- `dotenv` — loads your `.env` secrets into `process.env`
- `nodemailer` — sends emails via cPanel SMTP (OTP, confirmations)
- `express-session` — keeps users logged in server-side
- `bcryptjs` — hashes passwords (for employee table)
- `cors` — allows your frontend to call the API

---

## STEP 2 — Create your `.env` file

Create a file called `.env` in your project root (same level as `server.js`).
**Never commit this file.**

```env
# ── Server ──────────────────────────────
PORT=3000
SESSION_SECRET=replace_this_with_a_long_random_string_abc123xyz

# ── MySQL / cPanel Database ─────────────
DB_HOST=localhost
DB_PORT=3306
DB_USER=omtpi_dbuser
DB_PASSWORD=your_database_password_here
DB_NAME=omtpi_helpdesk

# ── cPanel SMTP (Nodemailer) ─────────────
SMTP_HOST=mail.omtpi.com.ph
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@omtpi.com.ph
SMTP_PASS=your_email_password_here
SMTP_FROM="OMTPI HelpDesk <noreply@omtpi.com.ph>"

# ── cPanel mailing list check ────────────
# The cPanel API token (generate in cPanel → Manage API Tokens)
CPANEL_HOST=omtpi.com.ph
CPANEL_PORT=2083
CPANEL_USER=your_cpanel_username
CPANEL_API_TOKEN=your_cpanel_api_token_here

# ── App domain (used in email links) ────
APP_URL=http://localhost:3000
```

---

## STEP 3 — Create `.gitignore`

```
node_modules/
.env
*.log
```

---

## STEP 4 — Create cPanel Database & Tables

### 4a. Log in to cPanel → MySQL Databases

1. Go to `https://omtpi.com.ph:2083` → **MySQL Databases**
2. Create a database: `omtpi_helpdesk`
3. Create a user: `omtpi_dbuser` with a strong password
4. Add user to database → grant **ALL PRIVILEGES**

### 4b. Run this SQL to create your tables

Go to **phpMyAdmin** → select `omtpi_helpdesk` → SQL tab → paste and run:

```sql
-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120)  NOT NULL,
  email       VARCHAR(180)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,   -- bcrypt hash
  role        ENUM('admin','agent','viewer') DEFAULT 'agent',
  dept        VARCHAR(80)   DEFAULT NULL,
  active      TINYINT(1)    DEFAULT 1,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_no   VARCHAR(12)   NOT NULL UNIQUE,  -- e.g. TK-0001
  type        ENUM('internal','external') NOT NULL,
  dept        VARCHAR(80)   DEFAULT NULL,
  subject     VARCHAR(255)  NOT NULL,
  description TEXT          DEFAULT NULL,
  priority    ENUM('low','medium','high','critical') DEFAULT 'medium',
  status      ENUM('open','progress','resolved','closed') DEFAULT 'open',
  requester   VARCHAR(120)  NOT NULL,
  email       VARCHAR(180)  DEFAULT NULL,
  phone       VARCHAR(20)   DEFAULT NULL,
  assignee    VARCHAR(120)  DEFAULT 'Unassigned',
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT           NOT NULL,
  author      VARCHAR(120)  NOT NULL,
  body        TEXT          NOT NULL,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- OTP table (temporary, cleaned up after use)
CREATE TABLE IF NOT EXISTS otp_codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(20)   NOT NULL,
  code        VARCHAR(6)    NOT NULL,
  expires_at  DATETIME      NOT NULL,
  used        TINYINT(1)    DEFAULT 0,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- Customer cooldown table
CREATE TABLE IF NOT EXISTS ticket_cooldowns (
  phone       VARCHAR(20)   NOT NULL PRIMARY KEY,
  submitted_at DATETIME     NOT NULL
);

-- Insert a default admin employee (password: Admin@2024)
-- Change this immediately after first login!
INSERT INTO employees (name, email, password, role)
VALUES (
  'Admin',
  'admin@omtpi.com.ph',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
);
```

> **Note:** The hashed password above is `password`. Generate a real hash using:
> `node -e "const b=require('bcryptjs');b.hash('YourPassword',10).then(console.log)"`

---

## STEP 5 — Create `db.js` (MySQL connection pool)

```js
// db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

module.exports = pool;
```

---

## STEP 6 — Create `mailer.js` (cPanel SMTP)

```js
// mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a plain/HTML email.
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
async function sendMail(to, subject, html) {
  return transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

/**
 * Send OTP via email (fallback if SMS not available).
 * For PH/JP phone OTP you'd use an SMS gateway instead.
 */
async function sendOTPEmail(to, otp) {
  return sendMail(to, 'Your OMTPI HelpDesk OTP', `
    <p>Your one-time password is:</p>
    <h2 style="letter-spacing:6px;">${otp}</h2>
    <p>It expires in 5 minutes. Do not share it.</p>
  `);
}

async function sendTicketConfirmation(to, ticketNo, subject) {
  return sendMail(to, `Ticket ${ticketNo} received — OMTPI HelpDesk`, `
    <p>Hi,</p>
    <p>Your support ticket has been received.</p>
    <table style="margin:12px 0;">
      <tr><td><b>Ticket ID:</b></td><td>${ticketNo}</td></tr>
      <tr><td><b>Subject:</b></td><td>${subject}</td></tr>
    </table>
    <p>Our team will follow up shortly.</p>
    <p>— OMTPI Support Team</p>
  `);
}

module.exports = { sendMail, sendOTPEmail, sendTicketConfirmation };
```

---

## STEP 7 — Create `routes/auth.js`

```js
// routes/auth.js
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const https    = require('https');
const db       = require('../db');
const { sendOTPEmail } = require('../mailer');

// ── Helpers ──────────────────────────────────────────────

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function validatePhone(country, number) {
  const d = number.replace(/\D/g, '');
  if (country === '+63') return /^9\d{9}$/.test(d);
  if (country === '+81') return /^\d{10,11}$/.test(d);
  return false;
}

// Check cPanel mailing list via cPanel UAPI
// Returns true if email is on any mailing list for omtpi.com.ph
async function isOnCpanelMailingList(email) {
  return new Promise((resolve) => {
    const opts = {
      hostname: process.env.CPANEL_HOST,
      port:     process.env.CPANEL_PORT || 2083,
      path:     `/execute/Email/list_lists?domain=omtpi.com.ph`,
      headers: {
        Authorization: `cpanel ${process.env.CPANEL_USER}:${process.env.CPANEL_API_TOKEN}`,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const lists = (json.data || []).map(l => l.list + '@omtpi.com.ph');
          // Check if the email itself is a list address
          resolve(lists.includes(email.toLowerCase()));
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// ── POST /api/auth/send-otp ───────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { country, phone } = req.body;
  if (!country || !phone) return res.status(400).json({ error: 'country and phone required' });
  if (!validatePhone(country, phone)) return res.status(400).json({ error: 'Invalid phone number' });

  const fullPhone = country + phone.replace(/\D/g, '');

  // Check cooldown
  const [rows] = await db.query(
    'SELECT submitted_at FROM ticket_cooldowns WHERE phone = ?', [fullPhone]
  );
  if (rows.length) {
    const elapsed = Date.now() - new Date(rows[0].submitted_at).getTime();
    if (elapsed < 60 * 60 * 1000) {
      const remaining = 60 * 60 * 1000 - elapsed;
      return res.status(429).json({ error: 'cooldown', remaining });
    }
  }

  // Generate OTP, save to DB (expires in 5 min)
  const otp     = generateOTP();
  const expires = new Date(Date.now() + 5 * 60 * 1000);

  await db.query(
    'DELETE FROM otp_codes WHERE phone = ?', [fullPhone]
  );
  await db.query(
    'INSERT INTO otp_codes (phone, code, expires_at) VALUES (?, ?, ?)',
    [fullPhone, otp, expires]
  );

  // TODO: Replace with SMS gateway (Semaphore for PH, Twilio for JP)
  // For now we log it and optionally email if email was provided
  console.log(`[OTP] ${fullPhone} → ${otp}`);

  return res.json({ success: true, dev_otp: otp }); // Remove dev_otp in production
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const { country, phone, code } = req.body;
  const fullPhone = country + phone.replace(/\D/g, '');

  const [rows] = await db.query(
    'SELECT * FROM otp_codes WHERE phone = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
    [fullPhone]
  );

  if (!rows.length || rows[0].code !== code) {
    return res.status(401).json({ error: 'Invalid or expired OTP' });
  }

  // Mark OTP used
  await db.query('UPDATE otp_codes SET used = 1 WHERE id = ?', [rows[0].id]);

  // Start session
  req.session.user = { role: 'customer', phone: fullPhone };
  return res.json({ success: true });
});

// ── POST /api/auth/employee-login ─────────────────────────
router.post('/employee-login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const lower = email.toLowerCase().trim();

  // Must be @omtpi.com.ph OR on cPanel mailing list
  const isCompanyEmail = lower.endsWith('@omtpi.com.ph');
  const isOnList       = isCompanyEmail ? true : await isOnCpanelMailingList(lower);

  if (!isCompanyEmail && !isOnList) {
    return res.status(403).json({ error: 'Access denied. Not a registered company email.' });
  }

  // Check DB
  const [rows] = await db.query(
    'SELECT * FROM employees WHERE email = ? AND active = 1 LIMIT 1', [lower]
  );

  if (!rows.length) return res.status(401).json({ error: 'No account found for this email.' });

  const valid = await bcrypt.compare(password, rows[0].password);
  if (!valid) return res.status(401).json({ error: 'Incorrect password.' });

  req.session.user = {
    role:  'employee',
    id:    rows[0].id,
    name:  rows[0].name,
    email: rows[0].email,
    dept:  rows[0].dept,
  };

  return res.json({ success: true, name: rows[0].name });
});

// ── POST /api/auth/logout ─────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── GET /api/auth/session ─────────────────────────────────
router.get('/session', (req, res) => {
  if (req.session.user) return res.json({ user: req.session.user });
  return res.status(401).json({ error: 'Not logged in' });
});

module.exports = router;
```

---

## STEP 8 — Create `routes/tickets.js`

```js
// routes/tickets.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { sendTicketConfirmation } = require('../mailer');

// Middleware: must be logged in
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Middleware: employees only
function requireEmployee(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'employee') {
    return res.status(403).json({ error: 'Employees only' });
  }
  next();
}

// Helper: generate TK-XXXX
async function nextTicketNo() {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM tickets');
  const num = rows[0].cnt + 1;
  return 'TK-' + String(num).padStart(4, '0');
}

// ── POST /api/tickets (customer OR employee) ──────────────
router.post('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  const { type, dept, subject, description, priority, requester, email, phone, assignee } = req.body;

  if (!subject || !requester) return res.status(400).json({ error: 'subject and requester required' });

  // Customers can only submit external tickets
  const ticketType = user.role === 'customer' ? 'external' : (type || 'external');

  // Check cooldown for customers
  if (user.role === 'customer') {
    const [cd] = await db.query(
      'SELECT submitted_at FROM ticket_cooldowns WHERE phone = ?', [user.phone]
    );
    if (cd.length) {
      const elapsed = Date.now() - new Date(cd[0].submitted_at).getTime();
      if (elapsed < 60 * 60 * 1000) {
        const remaining = 60 * 60 * 1000 - elapsed;
        return res.status(429).json({ error: 'cooldown', remaining });
      }
    }
  }

  const ticketNo = await nextTicketNo();

  await db.query(
    `INSERT INTO tickets
      (ticket_no, type, dept, subject, description, priority, requester, email, phone, assignee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketNo, ticketType, dept || 'General', subject, description || '',
     priority || 'medium', requester, email || null,
     phone || user.phone || null, assignee || 'Unassigned']
  );

  // Set cooldown for customers
  if (user.role === 'customer') {
    await db.query(
      `INSERT INTO ticket_cooldowns (phone, submitted_at) VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE submitted_at = NOW()`,
      [user.phone]
    );
  }

  // Send confirmation email if email provided
  if (email) {
    sendTicketConfirmation(email, ticketNo, subject).catch(console.error);
  }

  return res.json({ success: true, ticketNo });
});

// ── GET /api/tickets (employees only) ─────────────────────
router.get('/', requireEmployee, async (req, res) => {
  const { view, status, q } = req.query;
  let sql    = 'SELECT * FROM tickets WHERE 1=1';
  const args = [];

  if (view === 'internal') { sql += ' AND type = ?'; args.push('internal'); }
  if (view === 'external') { sql += ' AND type = ?'; args.push('external'); }
  if (view === 'resolved') { sql += ' AND status IN (?,?)'; args.push('resolved','closed'); }
  if (view === 'all')      { sql += ' AND status NOT IN (?,?)'; args.push('resolved','closed'); }
  if (status && status !== 'all') { sql += ' AND status = ?'; args.push(status); }
  if (q) {
    sql += ' AND (ticket_no LIKE ? OR subject LIKE ? OR requester LIKE ?)';
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY updated_at DESC';
  const [rows] = await db.query(sql, args);
  return res.json({ tickets: rows });
});

// ── GET /api/tickets/:id ──────────────────────────────────
router.get('/:id', requireEmployee, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const [comments] = await db.query(
    'SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC', [rows[0].id]
  );
  return res.json({ ticket: rows[0], comments });
});

// ── PATCH /api/tickets/:id/status ─────────────────────────
router.patch('/:id/status', requireEmployee, async (req, res) => {
  const { status } = req.body;
  const allowed = ['open','progress','resolved','closed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.query('UPDATE tickets SET status = ? WHERE id = ?', [status, req.params.id]);
  return res.json({ success: true });
});

// ── POST /api/tickets/:id/comments ────────────────────────
router.post('/:id/comments', requireEmployee, async (req, res) => {
  const { body } = req.body;
  const author   = req.session.user.name || req.session.user.email;
  if (!body) return res.status(400).json({ error: 'Comment body required' });
  await db.query(
    'INSERT INTO comments (ticket_id, author, body) VALUES (?, ?, ?)',
    [req.params.id, author, body]
  );
  return res.json({ success: true });
});

module.exports = router;
```

---

## STEP 9 — Update `server.js`

Replace your current `server.js` with:

```js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');

const authRoutes   = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,       // set true in production with HTTPS
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,  // 8-hour session
  },
}));

// ── Static files ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/tickets', ticketRoutes);

// ── SPA fallback (all non-API routes → index.html) ───────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`OMTPI HelpDesk running at http://localhost:${PORT}`);
});
```

---

## STEP 10 — Run the server

In **Git Bash**:

```bash
node server.js
```

Or install nodemon for auto-restart on file changes:

```bash
npm install --save-dev nodemon
```

Then add to `package.json` scripts:
```json
"scripts": {
  "start":  "node server.js",
  "dev":    "nodemon server.js"
}
```

Run with:
```bash
npm run dev
```

Open browser: `http://localhost:3000`

---

## STEP 11 — cPanel Deployment checklist

When deploying to live cPanel hosting:

1. Upload all files via **File Manager** or **Git** (exclude `node_modules/`)
2. In cPanel → **Setup Node.js App** → point entry file to `server.js`
3. Click **Run NPM Install** inside cPanel's Node.js app manager
4. Set your `.env` variables in cPanel → **Environment Variables** section
5. Change `cookie.secure` to `true` in `server.js` (you'll have HTTPS)
6. Set `DB_HOST=localhost` (cPanel MySQL is always localhost)
7. Generate cPanel API token: cPanel → **Manage API Tokens** → create token → paste into `.env`

---

## Notes on SMS OTP (production)

For real SMS delivery to PH/JP numbers, use one of:

| Provider | PH support | JP support | Notes |
|----------|-----------|-----------|-------|
| Semaphore | ✅ | ❌ | Best for PH, cheap |
| Vonage (Nexmo) | ✅ | ✅ | Global, reliable |
| Twilio | ✅ | ✅ | Most popular, costlier |

In `routes/auth.js`, replace the `console.log` OTP line with the provider's SDK call.

---

## STEP 12 — Dark / Light mode

See `public/css/theme.css` — the toggle button is already wired.
The theme preference is saved in `localStorage` and applied on page load.
