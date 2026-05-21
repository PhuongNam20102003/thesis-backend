const express = require('express');
const router  = express.Router();
const pool    = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ── Helper: tạo thông báo (dùng từ các route khác) ────────────────
const createNotification = async (userId, type, message, link = null) => {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, link)
       VALUES ($1, $2, $3, $4)`,
      [userId, type, message, link]
    );
  } catch (err) {
    console.error('Notification error:', err.message);
  }
};

// ══════════════════════════════════════════════════════════════════
// GET /notifications  — lấy thông báo của user hiện tại
// ══════════════════════════════════════════════════════════════════
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// PATCH /notifications/:id/read  — đánh dấu 1 thông báo đã đọc
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'OK' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// PATCH /notifications/read-all  — đánh dấu tất cả đã đọc
// ══════════════════════════════════════════════════════════════════
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ message: 'OK' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router, createNotification };