const pool = require('../config/database');

// PHÂN CÔNG HỘI ĐỒNG (phản biện, chủ tịch, thư ký)
const assignReviewer = async (req, res) => {
  const { topic_id, reviewer_id, chairman_id, secretary_id } = req.body;

  try {
    const topic = await pool.query(
      'SELECT teacher_id FROM topics WHERE id = $1', [topic_id]
    );
    if (topic.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
    }

    const teacherId = topic.rows[0].teacher_id;

    // Chuyển sang số nguyên hoặc null
    const rv  = reviewer_id  ? parseInt(reviewer_id)  : null;
    const ch  = chairman_id  ? parseInt(chairman_id)  : null;
    const sec = secretary_id ? parseInt(secretary_id) : null;

    // Không được trùng GV hướng dẫn
    if (rv  === teacherId) return res.status(400).json({ message: 'GV phản biện không được trùng GV hướng dẫn!' });
    if (ch  === teacherId) return res.status(400).json({ message: 'Chủ tịch không được trùng GV hướng dẫn!' });
    if (sec === teacherId) return res.status(400).json({ message: 'Thư ký không được trùng GV hướng dẫn!' });

    // 3 vai trò không được trùng nhau
    if (rv && ch  && rv  === ch)  return res.status(400).json({ message: 'GV phản biện và Chủ tịch không được là cùng một người!' });
    if (rv && sec && rv  === sec) return res.status(400).json({ message: 'GV phản biện và Thư ký không được là cùng một người!' });
    if (ch && sec && ch  === sec) return res.status(400).json({ message: 'Chủ tịch và Thư ký không được là cùng một người!' });

    // Lưu toàn bộ — dùng UPDATE trực tiếp thay vì COALESCE
    const existing = await pool.query(
      'SELECT id FROM council_assignments WHERE topic_id = $1', [topic_id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE council_assignments 
         SET reviewer_id = $1, chairman_id = $2, secretary_id = $3, assigned_at = NOW()
         WHERE topic_id = $4`,
        [rv, ch, sec, topic_id]
      );
    } else {
      await pool.query(
        `INSERT INTO council_assignments (topic_id, reviewer_id, chairman_id, secretary_id)
         VALUES ($1, $2, $3, $4)`,
        [topic_id, rv, ch, sec]
      );
    }

    res.json({ message: 'Đã phân công hội đồng thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

const getCouncilList = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id as topic_id,
        t.title as topic_title,
        t.field,
        teacher.full_name as teacher_name,
        reviewer.full_name as reviewer_name,
        chairman.full_name as chairman_name,
        secretary.full_name as secretary_name,
        STRING_AGG(student.full_name, ', ') as students
      FROM topics t
      JOIN users teacher ON t.teacher_id = teacher.id

      LEFT JOIN council_assignments ca ON ca.topic_id = t.id
      LEFT JOIN users reviewer ON ca.reviewer_id = reviewer.id
      LEFT JOIN users chairman ON ca.chairman_id = chairman.id
      LEFT JOIN users secretary ON ca.secretary_id = secretary.id

      JOIN registrations reg 
        ON reg.topic_id = t.id 
       AND reg.status = 'approved'

      JOIN users student ON reg.student_id = student.id

      GROUP BY 
        t.id,
        t.title,
        t.field,
        teacher.full_name,
        reviewer.full_name,
        chairman.full_name,
        secretary.full_name

      ORDER BY t.id
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      message: 'Lỗi server',
      error: err.message
    });
  }
};

// TỔNG QUAN (trưởng ngành)
const getOverview = async (req, res) => {
  try {
    const [topics, regs, teachers, students] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM topics'),
      pool.query('SELECT status, COUNT(*) as count FROM registrations GROUP BY status'),
      pool.query(`
        SELECT u.id, u.full_name, u.research_field,
          COUNT(t.id) as topic_count,
          COUNT(r.id) FILTER (WHERE r.status = 'approved') as student_count
        FROM users u
        LEFT JOIN topics t ON t.teacher_id = u.id
        LEFT JOIN registrations r ON r.topic_id = t.id
        WHERE u.role = 'teacher'
        GROUP BY u.id
      `),
      pool.query(`
        SELECT COUNT(DISTINCT student_id) as count
        FROM registrations
      `),
    ]);

    const regStats = {};
    regs.rows.forEach(r => { regStats[r.status] = parseInt(r.count); });

    res.json({
      total_topics: parseInt(topics.rows[0].count),
      total_students_registered: parseInt(students.rows[0].count),
      approved: regStats['approved'] || 0,
      pending: regStats['pending'] || 0,
      rejected: regStats['rejected'] || 0,
      teachers: teachers.rows,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};

module.exports = { assignReviewer, getCouncilList, getOverview };