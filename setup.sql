-- setup.sql — Run this once in phpMyAdmin or MySQL CLI
-- Database: omtpi_helpdesk

-- ── Employees ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120)                          NOT NULL,
  email      VARCHAR(180)                          NOT NULL UNIQUE,
  password   VARCHAR(255)                          NOT NULL,
  role       ENUM('admin','agent','viewer')        DEFAULT 'agent',
  dept       VARCHAR(80)                           DEFAULT NULL,
  active     TINYINT(1)                            DEFAULT 1,
  created_at DATETIME                              DEFAULT CURRENT_TIMESTAMP
);

-- ── Tickets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_no   VARCHAR(12)                                        NOT NULL UNIQUE,
  type        ENUM('internal','external')                        NOT NULL DEFAULT 'internal',
  dept        VARCHAR(80)                                        DEFAULT NULL,
  subject     VARCHAR(255)                                       NOT NULL,
  description TEXT                                               DEFAULT NULL,
  priority    ENUM('low','medium','high','critical')             DEFAULT 'medium',
  status      ENUM('open','progress','resolved','closed')        DEFAULT 'open',
  requester   VARCHAR(120)                                       NOT NULL,
  email       VARCHAR(180)                                       DEFAULT NULL,
  assignee    VARCHAR(120)                                       DEFAULT 'Unassigned',
  created_at  DATETIME                                           DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME                                           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Comments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id  INT       NOT NULL,
  author     VARCHAR(120) NOT NULL,
  body       TEXT         NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- ── Mail messages ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mail_messages (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  sender_employee_id INT           NOT NULL,
  subject            VARCHAR(255)  NOT NULL,
  body_html          LONGTEXT      NOT NULL,
  target_mode        ENUM('department','active_agents_admins','custom') NOT NULL,
  target_label       VARCHAR(255)  DEFAULT NULL,
  created_at         DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ── Mail recipients ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS mail_recipients (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  mail_message_id          INT           NOT NULL,
  recipient_employee_id    INT           DEFAULT NULL,
  recipient_email          VARCHAR(180)  DEFAULT NULL,
  recipient_name           VARCHAR(120)  DEFAULT NULL,
  recipient_role           VARCHAR(50)   DEFAULT NULL,
  recipient_dept           VARCHAR(120)  DEFAULT NULL,
  delivery_type            VARCHAR(50)   DEFAULT 'direct',
  forwarded_to_employee_id INT           DEFAULT NULL,
  status                   VARCHAR(50)   DEFAULT 'sent',
  is_read                  TINYINT(1)    DEFAULT 0,
  read_at                  DATETIME      DEFAULT NULL,
  is_archived              TINYINT(1)    DEFAULT 0,
  archived_at              DATETIME      DEFAULT NULL,
  error_message            TEXT          DEFAULT NULL,
  sent_at                  DATETIME      DEFAULT NULL,
  created_at               DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ── Mail forwarding rules ─────────────────────────────────
CREATE TABLE IF NOT EXISTS mail_forwarding_rules (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  source_employee_id     INT       NOT NULL,
  target_employee_id     INT       NOT NULL,
  active                 TINYINT(1) DEFAULT 1,
  created_by_employee_id INT       DEFAULT NULL,
  created_at             DATETIME  DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source (source_employee_id)
);

-- ── Default admin account ─────────────────────────────────
-- Password: Admin@1234  (change immediately after first login)
INSERT IGNORE INTO employees (name, email, password, role, dept)
VALUES (
  'Admin',
  'admin@omtpi.com.ph',
  '$2b$10$wRivQVHGo8MR7FBwkWm27.UWQ6fPNgXBvX5jAMLdcxfqHiPl4q8te',
  'admin',
  'IT'
);