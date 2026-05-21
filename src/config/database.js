const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
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