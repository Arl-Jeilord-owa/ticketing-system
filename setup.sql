-- ─────────────────────────────────────────────────────────────
-- setup.sql
-- OMTPI HelpDesk — run once in phpMyAdmin or MySQL CLI
-- Database: omtpi_helpdesk  (create it first in cPanel)
-- ─────────────────────────────────────────────────────────────

-- Use your database
USE omtpi_helpdesk;

-- ── Employees ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120)  NOT NULL,
  email       VARCHAR(180)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,        -- bcrypt hash
  role        ENUM('admin','agent','viewer') DEFAULT 'agent',
  dept        VARCHAR(80)   DEFAULT NULL,
  active      TINYINT(1)    DEFAULT 1,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Tickets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  ticket_no   VARCHAR(12)   NOT NULL UNIQUE,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Comments (activity log per ticket) ───────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT           NOT NULL,
  author      VARCHAR(120)  NOT NULL,
  body        TEXT          NOT NULL,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── OTP codes (short-lived, cleaned up after use) ────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(20)   NOT NULL,
  code        VARCHAR(6)    NOT NULL,
  expires_at  DATETIME      NOT NULL,
  used        TINYINT(1)    DEFAULT 0,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Customer cooldown (one ticket per hour per phone) ─────────
CREATE TABLE IF NOT EXISTS ticket_cooldowns (
  phone         VARCHAR(20) NOT NULL PRIMARY KEY,
  submitted_at  DATETIME    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
--  Seed: default admin account
--  Email:    admin@omtpi.com.ph
--  Password: Admin@2024   ← CHANGE THIS immediately after setup
--
--  To generate your own hash, run in Git Bash:
--    node -e "const b=require('bcryptjs');b.hash('YourPassword',10).then(console.log)"
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO employees (name, email, password, role)
VALUES (
  'Admin',
  'admin@omtpi.com.ph',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'admin'
);

-- Seed: IT agent
INSERT IGNORE INTO employees (name, email, password, role, dept)
VALUES (
  'IT Support',
  'it@omtpi.com.ph',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'agent',
  'IT'
);

-- ─────────────────────────────────────────────────────────────
--  Optional: clean up expired OTPs (run as a scheduled task)
--  DELETE FROM otp_codes WHERE expires_at < NOW();
-- ─────────────────────────────────────────────────────────────

-- ── Customer profiles (collected at registration) ─────────────
-- Linked to the ticket by phone number (same key as cooldowns)
CREATE TABLE IF NOT EXISTS customer_profiles (
  phone         VARCHAR(20)   NOT NULL PRIMARY KEY,
  first_name    VARCHAR(80)   NOT NULL,
  last_name     VARCHAR(80)   NOT NULL,
  email         VARCHAR(180)  NOT NULL,
  country       VARCHAR(10)   NOT NULL,   -- ISO country code, e.g. PH
  city          VARCHAR(120)  NOT NULL,
  address       VARCHAR(255)  DEFAULT NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
