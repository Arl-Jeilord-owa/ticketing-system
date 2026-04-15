// db.js — MySQL2 connection pool
// Uses .env for credentials. Never hardcode passwords here.
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+08:00', // PHT (UTC+8)
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('[DB] Connected to MySQL:', process.env.DB_NAME);
    conn.release();
  })
  .catch(err => {
    console.error('[DB] Connection failed:', err.message);
    console.error('     Check your .env DB_* variables.');
  });

module.exports = pool;
