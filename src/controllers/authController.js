const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ĐĂNG KÝ TÀI KHOẢN
const register = async (req, res) => {
  const { full_name, email, password, role, student_class, gpa, research_field } = req.body;

  // Kiểm tra nhập đủ thông tin
  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin!' });
  }

  try {
    // Kiểm tra email đã tồn tại chưa
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email này đã được đăng ký!' });
    }

    // Mã hóa mật khẩu (KHÔNG lưu mật khẩu thô vào database)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Lưu vào database
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password, role, student_class, gpa, research_field)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, full_name, email, role`,
      [full_name, email, hashedPassword, role, student_class || null, gpa || null, research_field || null]
    );

    res.status(201).json({
      message: 'Đăng ký thành công!',
      user: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// ĐĂNG NHẬP
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu!' });
  }

  try {
    // Tìm user theo email
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng!' });
    }

    const user = result.rows[0];

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng!' });
    }

    // Tạo JWT token (hết hạn sau 7 ngày)
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Đăng nhập thành công!',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        student_class: user.student_class,
        research_field: user.research_field,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// LẤY THÔNG TIN USER ĐANG ĐĂNG NHẬP
const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role, student_class, gpa, research_field FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// CẬP NHẬT THÔNG TIN CÁ NHÂN
const updateProfile = async (req, res) => {
  const { full_name, student_class, gpa, research_field } = req.body;
  if (!full_name?.trim()) return res.status(400).json({ message: 'Họ tên không được để trống!' });

  try {
    const result = await pool.query(
      `UPDATE users SET full_name=$1, student_class=$2, gpa=$3, research_field=$4
       WHERE id=$5 RETURNING id, full_name, email, role, student_class, gpa, research_field`,
      [full_name.trim(), student_class || null, gpa ? parseFloat(gpa) : null, research_field || null, req.user.id]
    );
    res.json({ message: 'Đã cập nhật thông tin!', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// ĐỔI MẬT KHẨU
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ message: 'Vui lòng nhập đủ thông tin!' });
  if (new_password.length < 6) return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });

  try {
    const result = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    const isMatch = await bcrypt.compare(current_password, result.rows[0].password);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng!' });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, req.user.id]);
    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// Thêm vào module.exports:
module.exports = { register, login, getMe, updateProfile, changePassword };