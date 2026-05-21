// Kết nối tới PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test kết nối khi khởi động
pool.connect((err) => {
  if (err) {
    console.error('Lỗi kết nối database:', err);
  } else {
    console.log('Đã kết nối PostgreSQL thành công!');
  }
});

module.exports = pool;