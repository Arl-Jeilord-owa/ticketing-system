CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255),
  active BOOLEAN DEFAULT 1
);

CREATE TABLE tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(20),
  subject VARCHAR(200),
  description TEXT,
  priority VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);