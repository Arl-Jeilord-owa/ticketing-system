CREATE TABLE IF NOT EXISTS mail_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_employee_id INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body_html LONGTEXT NOT NULL,
  target_mode ENUM('department','active_agents_admins','custom') NOT NULL,
  target_label VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mail_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mail_message_id INT NOT NULL,
  recipient_employee_id INT,
  recipient_email VARCHAR(180),
  recipient_name VARCHAR(120),
  recipient_role VARCHAR(50),
  recipient_dept VARCHAR(120),
  delivery_type VARCHAR(50),
  forwarded_to_employee_id INT,
  status VARCHAR(50) DEFAULT 'sent',

  is_read TINYINT(1) DEFAULT 0,
  read_at DATETIME,
  is_archived TINYINT(1) DEFAULT 0,
  archived_at DATETIME,

  error_message TEXT,
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mail_forwarding_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_employee_id INT NOT NULL,
  target_employee_id INT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_by_employee_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);