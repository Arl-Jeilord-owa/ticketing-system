// db.js — MySQL2 connection pool
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

// Verify connection on startup
pool.getConnection()
  .then(conn => {
    console.log(`[DB] ✅  Connected → ${process.env.DB_NAME}@${process.env.DB_HOST}`);
    conn.release();
  })
  .catch(err => {
    console.error(`[DB] ❌  Connection failed: ${err.message}`);
    console.error('         → Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env');
  });

module.exports = pool;