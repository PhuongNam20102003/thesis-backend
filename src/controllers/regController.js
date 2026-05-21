const pool = require('../config/database');
const { sendApprovedEmail, sendRejectedEmail } = require('../utils/emailservice');
const { createNotification } = require('../routes/Notificationroutes');

// SINH VIÊN ĐĂNG KÝ ĐỀ TÀI
const registerTopic = async (req, res) => {
  const { topic_id } = req.body;
  const student_id = req.user.id;

  try {
    const existing = await pool.query(
      'SELECT * FROM registrations WHERE student_id = $1',
      [student_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Bạn đã đăng ký đề tài rồi! Mỗi sinh viên chỉ được đăng ký 1 đề tài.' });
    }

    const topic = await pool.query('SELECT * FROM topics WHERE id = $1', [topic_id]);
    if (topic.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
    }

    const approved = await pool.query(
      'SELECT COUNT(*) FROM registrations WHERE topic_id = $1 AND status = $2',
      [topic_id, 'approved']
    );
    if (parseInt(approved.rows[0].count) >= topic.rows[0].max_students) {
      return res.status(400).json({ message: 'Đề tài này đã đủ số lượng sinh viên!' });
    }

    await pool.query(
      'INSERT INTO registrations (student_id, topic_id) VALUES ($1, $2)',
      [student_id, topic_id]
    );

    // 🔔 Thông báo cho giảng viên: có sinh viên đăng ký đề tài
    const student = await pool.query('SELECT full_name FROM users WHERE id = $1', [student_id]);
    await createNotification(
      topic.rows[0].teacher_id,
      'form_submitted',
      `📝 Sinh viên ${student.rows[0]?.full_name} vừa đăng ký đề tài "${topic.rows[0].title}"`,
      '/pending-regs'
    );

    res.status(201).json({ message: 'Đăng ký thành công! Đang chờ giảng viên xét duyệt.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Bạn đã đăng ký đề tài rồi!' });
    }
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// LẤY ĐĂNG KÝ CỦA SINH VIÊN ĐANG ĐĂNG NHẬP
const getMyRegistration = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, t.title as topic_title, t.description, t.field,
              u.full_name as teacher_name, u.email as teacher_email
       FROM registrations r
       JOIN topics t ON r.topic_id = t.id
       JOIN users u ON t.teacher_id = u.id
       WHERE r.student_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// HUỶ ĐĂNG KÝ
const cancelRegistration = async (req, res) => {
  try {
    const reg = await pool.query(
      'SELECT * FROM registrations WHERE student_id = $1',
      [req.user.id]
    );
    if (reg.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đăng ký!' });
    }
    if (reg.rows[0].status === 'approved') {
      return res.status(400).json({ message: 'Không thể huỷ đăng ký đã được duyệt!' });
    }

    await pool.query('DELETE FROM registrations WHERE student_id = $1', [req.user.id]);
    res.json({ message: 'Đã huỷ đăng ký thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// GIẢNG VIÊN XEM DANH SÁCH ĐĂNG KÝ
const getTopicRegistrations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name as student_name, u.email as student_email,
              u.student_class, u.gpa, t.title as topic_title, t.id as topic_id
       FROM registrations r
       JOIN users u ON r.student_id = u.id
       JOIN topics t ON r.topic_id = t.id
       WHERE t.teacher_id = $1
       ORDER BY r.registered_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

// GIẢNG VIÊN DUYỆT / TỪ CHỐI ĐĂNG KÝ
const updateRegistrationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ!' });
  }

  try {
    const reg = await pool.query(
      `SELECT r.*, u.full_name as student_name, u.email as student_email,
              t.title as topic_title, tu.full_name as teacher_name
       FROM registrations r
       JOIN users u ON r.student_id = u.id
       JOIN topics t ON r.topic_id = t.id
       JOIN users tu ON t.teacher_id = tu.id
       WHERE r.id = $1 AND t.teacher_id = $2`,
      [id, req.user.id]
    );

    if (reg.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đăng ký hoặc bạn không có quyền!' });
    }

    const registration = reg.rows[0];

    if (status === 'approved') {
      const approved = await pool.query(
        'SELECT COUNT(*) FROM registrations WHERE topic_id = $1 AND status = $2',
        [registration.topic_id, 'approved']
      );
      const topic = await pool.query('SELECT max_students FROM topics WHERE id = $1', [registration.topic_id]);
      if (parseInt(approved.rows[0].count) >= topic.rows[0].max_students) {
        return res.status(400).json({ message: 'Đề tài đã đủ số lượng sinh viên!' });
      }
    }

    await pool.query('UPDATE registrations SET status = $1 WHERE id = $2', [status, id]);

    // 🔔 Thông báo cho sinh viên: đăng ký được duyệt/từ chối
    await createNotification(
      registration.student_id,
      status === 'approved' ? 'form_approved' : 'form_rejected',
      status === 'approved'
        ? `✅ Đăng ký đề tài "${registration.topic_title}" của bạn đã được duyệt!`
        : `❌ Đăng ký đề tài "${registration.topic_title}" của bạn bị từ chối.`,
      '/my-registration'
    );

    // Gửi email
    try {
      if (status === 'approved') {
        await sendApprovedEmail(
          registration.student_email,
          registration.student_name,
          registration.topic_title,
          registration.teacher_name
        );
      } else {
        await sendRejectedEmail(
          registration.student_email,
          registration.student_name,
          registration.topic_title
        );
      }
    } catch (emailErr) {
      console.error('Lỗi gửi email:', emailErr.message);
    }

    res.json({ message: status === 'approved' ? 'Đã duyệt và gửi email thông báo!' : 'Đã từ chối và gửi email thông báo!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

module.exports = {
  registerTopic,
  getMyRegistration,
  cancelRegistration,
  getTopicRegistrations,
  updateRegistrationStatus,
};