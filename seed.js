require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function seedAdmin() {
  const name = 'Admin User';
  const email = 'admin@omtpi.com.ph';
  const plainPassword = 'Admin@1234';
  const role = 'Admin';
  const dept = 'IT';

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const [result] = await pool.query(
    `INSERT INTO employees (name, email, password, role, dept)
     VALUES (?, ?, ?, ?, ?)`,
    [name, email, hashedPassword, role, dept]
  );

  console.log('✅ Admin created! ID:', result.insertId);
  process.exit();
}

seedAdmin().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});