const pool = require('../config/database');

// LẤY TẤT CẢ ĐỀ TÀI TRƯỞNG NGÀNH DUYỆT (sinh viên xem)
const getAllTopics = async (req, res) => {
  try {
    const { field, teacher_id, search } = req.query;

    let query = `
      SELECT t.*, u.full_name as teacher_name, u.research_field as teacher_field,
        (SELECT COUNT(*) FROM registrations r WHERE r.topic_id = t.id AND r.status = 'approved') as approved_count
      FROM topics t
      JOIN users u ON t.teacher_id = u.id
      WHERE t.status = 'approved'
    `;
    const params = [];

    if (field) {
      params.push(`%${field}%`);
      query += ` AND t.field ILIKE $${params.length}`;
    }
    if (teacher_id) {
      params.push(teacher_id);
      query += ` AND t.teacher_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`;
    }

    query += ' ORDER BY t.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// LẤY ĐỀ TÀI CỦA GIẢNG VIÊN ĐANG ĐĂNG NHẬP
const getMyTopics = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
        (SELECT COUNT(*) FROM registrations r WHERE r.topic_id = t.id AND r.status = 'approved') as approved_count,
        (SELECT COUNT(*) FROM registrations r WHERE r.topic_id = t.id AND r.status = 'pending') as pending_count
       FROM topics t
       WHERE t.teacher_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// ĐĂNG ĐỀ TÀI MỚI (chỉ giảng viên)
const createTopic = async (req, res) => {
  const { title, description, requirements, field, max_students } = req.body;

  if (!title || !description || !field) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin đề tài!' });
  }

  try {
    const result = await pool.query(
  `INSERT INTO topics (title, description, requirements, field, max_students, teacher_id, status)
   VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
  [title, description, requirements || '', field, max_students || 2, req.user.id] 
);
res.status(201).json({ message: 'Đã đăng đề tài! Đang chờ trưởng ngành duyệt.', topic: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// XOÁ ĐỀ TÀI
const deleteTopic = async (req, res) => {
  try {
    const topic = await pool.query(
      'SELECT * FROM topics WHERE id = $1 AND teacher_id = $2',
      [req.params.id, req.user.id]
    );
    if (topic.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đề tài hoặc bạn không có quyền xoá!' });
    }

    await pool.query('DELETE FROM topics WHERE id = $1', [req.params.id]);
    res.json({ message: 'Đã xoá đề tài!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// LẤY DANH SÁCH GIẢNG VIÊN (để lọc)
const getTeachers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, research_field FROM users WHERE role = $1',
      ['teacher']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// TRƯỞNG NGÀNH XEM ĐỀ TÀI CHỜ DUYỆT
const getPendingTopics = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name as teacher_name, u.email as teacher_email
       FROM topics t
       JOIN users u ON t.teacher_id = u.id
       WHERE t.status = 'pending'
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// TRƯỞNG NGÀNH DUYỆT / TỪ CHỐI ĐỀ TÀI
const approveOrRejectTopic = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' hoặc 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ!' });
  }

  try {
    const topic = await pool.query('SELECT * FROM topics WHERE id = $1', [id]);
    if (topic.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
    }

    await pool.query(
      'UPDATE topics SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({
      message: status === 'approved'
        ? 'Đã duyệt đề tài! Sinh viên có thể đăng ký.'
        : 'Đã từ chối đề tài!'
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// GIẢNG VIÊN CHỈNH SỬA ĐỀ TÀI
const updateTopic = async (req, res) => {
  const { id } = req.params;
  const { title, description, requirements, field, max_students } = req.body;

  try {
    // Kiểm tra đề tài có thuộc về giảng viên này không
    const topic = await pool.query(
      'SELECT * FROM topics WHERE id = $1 AND teacher_id = $2',
      [id, req.user.id]
    );
    if (topic.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đề tài hoặc bạn không có quyền!' });
    }

    await pool.query(
      `UPDATE topics 
       SET title = $1, description = $2, requirements = $3, 
           field = $4, max_students = $5, status = 'pending'
       WHERE id = $6`,
      [title, description, requirements, field, max_students, id]
    );

    res.json({ message: 'Đã cập nhật đề tài! Đề tài sẽ chờ trưởng ngành duyệt lại.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

module.exports = { 
  getAllTopics, getMyTopics, createTopic, deleteTopic, getTeachers,
  getPendingTopics, approveOrRejectTopic, updateTopic
};