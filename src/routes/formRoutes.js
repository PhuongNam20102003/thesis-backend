const express    = require('express');
const router     = express.Router();
const pool       = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { createNotification } = require('./NotificationRoutes');

// ─── Multer config cho BM08 file upload ───────────────────────────
// npm install multer
const uploadDir = path.join(__dirname, '../uploads/bm08');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${req.user?.id || 'u'}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(doc|docx)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file .doc hoặc .docx'));
    }
  },
});

// ══════════════════════════════════════════════════════════════════
// GET /my/:form_type  — sinh viên lấy form của mình
// FIX: BM04 trả về mảng forms[], các loại khác trả về form đơn
// ══════════════════════════════════════════════════════════════════
router.get('/my/:form_type', authenticate, async (req, res) => {
  const { form_type } = req.params;

  try {
    // Lấy đề tài đã được duyệt
    const reg = await pool.query(
      `SELECT r.*, t.title as topic_title, t.id as topic_id,
              u.full_name as teacher_name, u.email as teacher_email
       FROM registrations r
       JOIN topics t ON r.topic_id = t.id
       JOIN users u ON t.teacher_id = u.id
       WHERE r.student_id = $1 AND r.status = 'approved'`,
      [req.user.id]
    );

    if (!reg.rows[0]) {
      return res.status(404).json({ message: 'No approved topic' });
    }

    const registration = reg.rows[0];

    // FIX: BM04 trả về TẤT CẢ forms theo report_index (multi-period)
    if (form_type === 'BM04') {
      const forms = await pool.query(
        `SELECT * FROM student_forms
         WHERE student_id = $1 AND topic_id = $2 AND form_type = 'BM04'
         ORDER BY (form_data->>'report_index')::int ASC`,
        [req.user.id, registration.topic_id]
      );

      return res.json({
        registration,
        forms: forms.rows,   // mảng, frontend dùng forms[]
      });
    }

    // BM02, BM08: lấy form đơn mới nhất
    const form = await pool.query(
      `SELECT * FROM student_forms
       WHERE student_id = $1 AND topic_id = $2 AND form_type = $3
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, registration.topic_id, form_type]
    );

    res.json({
      registration,
      form: form.rows[0] || null,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /submit  — sinh viên nộp / lưu nháp BM02, BM04
// FIX: BM04 cho phép nhiều bản theo report_index, không dùng
//      ON CONFLICT (student_id, topic_id, form_type) nữa
// ══════════════════════════════════════════════════════════════════
router.post('/submit', authenticate, requireRole('student'), async (req, res) => {
  const { topic_id, form_type, form_data, student_signature, action } = req.body;

  try {

    const status       = action === 'submit' ? 'submitted' : 'draft';
    const submitted_at = action === 'submit' ? new Date() : null;

    // ── BM02: chỉ cho 1 form, có lock logic ─────────────────────
    if (form_type === 'BM02') {
      const existing = await pool.query(
        `SELECT * FROM student_forms
         WHERE student_id=$1 AND topic_id=$2 AND form_type='BM02'`,
        [req.user.id, topic_id]
      );
      const old = existing.rows[0];

      if (old?.status === 'approved') {
        return res.status(403).json({ message: 'BM02 đã được duyệt và không thể chỉnh sửa.' });
      }
      if (old?.status === 'submitted') {
        return res.status(403).json({ message: 'BM02 đang chờ giảng viên xét duyệt.' });
      }

      await pool.query(
        `INSERT INTO student_forms
           (student_id, topic_id, form_type, form_data, student_signature, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (student_id, topic_id, form_type)
         DO UPDATE SET
           form_data         = EXCLUDED.form_data,
           student_signature = EXCLUDED.student_signature,
           status            = EXCLUDED.status,
           submitted_at      = EXCLUDED.submitted_at,
           updated_at        = NOW()`,
        [req.user.id, topic_id, 'BM02', JSON.stringify(form_data), student_signature, status, submitted_at]
      );

      return res.json({ message: action === 'submit' ? 'Đã nộp BM02!' : 'Đã lưu nháp!' });
    }

    // ── BM04: mỗi report_index là 1 row riêng ───────────────────
    if (form_type === 'BM04') {
      const report_index = form_data?.report_index;

      if (!report_index) {
        return res.status(400).json({ message: 'Thiếu report_index' });
      }

      // Kiểm tra kỳ này đã lock chưa
      const existing = await pool.query(
        `SELECT * FROM student_forms
         WHERE student_id=$1 AND topic_id=$2 AND form_type='BM04'
           AND (form_data->>'report_index')::int = $3`,
        [req.user.id, topic_id, report_index]
      );
      const old = existing.rows[0];

      if (old?.status === 'approved') {
        return res.status(403).json({ message: `Kỳ ${report_index} đã được duyệt và không thể chỉnh sửa.` });
      }
      if (old?.status === 'submitted') {
        return res.status(403).json({ message: `Kỳ ${report_index} đang chờ giảng viên xét duyệt.` });
      }

      if (old) {
        // Update kỳ đã tồn tại
        await pool.query(
          `UPDATE student_forms SET
             form_data         = $1,
             student_signature = $2,
             status            = $3,
             submitted_at      = $4,
             updated_at        = NOW()
           WHERE id = $5`,
          [JSON.stringify(form_data), student_signature, status, submitted_at, old.id]
        );
      } else {
        // Insert kỳ mới
        await pool.query(
          `INSERT INTO student_forms
             (student_id, topic_id, form_type, form_data, student_signature, status, submitted_at)
           VALUES ($1,$2,'BM04',$3,$4,$5,$6)`,
          [req.user.id, topic_id, JSON.stringify(form_data), student_signature, status, submitted_at]
        );
      }

      return res.json({ message: action === 'submit' ? `Đã nộp kỳ ${report_index}!` : 'Đã lưu nháp!' });
    }

    // ── Fallback các form khác ───────────────────────────────────
    await pool.query(
      `INSERT INTO student_forms
         (student_id, topic_id, form_type, form_data, student_signature, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (student_id, topic_id, form_type)
       DO UPDATE SET
         form_data         = EXCLUDED.form_data,
         student_signature = EXCLUDED.student_signature,
         status            = EXCLUDED.status,
         submitted_at      = EXCLUDED.submitted_at,
         updated_at        = NOW()`,
      [req.user.id, topic_id, form_type, JSON.stringify(form_data), student_signature, status, submitted_at]
    );

    res.json({ message: action === 'submit' ? 'Đã nộp biểu mẫu!' : 'Đã lưu nháp!' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /submit-file  — sinh viên nộp BM08 (upload file Word)
// FIX: endpoint này bị thiếu hoàn toàn → gây 404
// ══════════════════════════════════════════════════════════════════
router.post('/submit-file', authenticate, requireRole('student'), upload.single('file'), async (req, res) => {
  const { topic_id, form_type = 'BM08' } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được tải lên' });
    }

    const fileInfo = {
      name: req.file.originalname,
      size: req.file.size,
      url:  `/uploads/bm08/${req.file.filename}`,
      path: req.file.path,
    };

    // Kiểm tra lock
    const existing = await pool.query(
      `SELECT * FROM student_forms
       WHERE student_id=$1 AND topic_id=$2 AND form_type=$3`,
      [req.user.id, topic_id, form_type]
    );
    const old = existing.rows[0];

    if (old?.status === 'approved') {
      return res.status(403).json({ message: 'BM08 đã được duyệt và không thể chỉnh sửa.' });
    }

    await pool.query(
      `INSERT INTO student_forms
         (student_id, topic_id, form_type, form_data, file, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,'submitted',NOW())
       ON CONFLICT (student_id, topic_id, form_type)
       DO UPDATE SET
         file         = EXCLUDED.file,
         status       = 'submitted',
         submitted_at = NOW(),
         updated_at   = NOW()`,
      [req.user.id, topic_id, form_type, JSON.stringify({}), JSON.stringify(fileInfo)]
    );

    res.json({ message: 'Đã nộp BM08!', file: fileInfo });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// PATCH /review/:id  — giảng viên duyệt / trả về
// ══════════════════════════════════════════════════════════════════
router.patch('/review/:id', authenticate, requireRole('teacher'), async (req, res) => {
  const { id } = req.params;
  const { status, teacher_comment, teacher_signature } = req.body;

  try {
    const result = await pool.query(
      `UPDATE student_forms SET
         status            = $1,
         teacher_comment   = $2,
         teacher_signature = $3,
         reviewed_at       = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, teacher_comment, teacher_signature, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Không tìm thấy form' });
    }

    // ── Gửi thông báo cho sinh viên ──────────────────────────────
    const form = result.rows[0];

    const message = status === 'approved'
      ? `✅ Form ${form.form_type} của bạn đã được duyệt!`
      : `↩ Form ${form.form_type} bị trả về${teacher_comment ? `: ${teacher_comment}` : ''}`;

    await createNotification(
      form.student_id,
      status === 'approved' ? 'form_approved' : 'form_rejected',
      message,
      '/my-forms'
    );
    // ─────────────────────────────────────────────────────────────

    res.json({ message: 'Đã cập nhật biểu mẫu!' });

  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /teacher/submissions  — giảng viên xem tất cả submissions
// ══════════════════════════════════════════════════════════════════
router.get('/teacher/submissions', authenticate, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         sf.*,
         u.full_name as student_name,
         u.email    as student_email,
         t.title    as topic_title
       FROM student_forms sf
       JOIN users  u ON sf.student_id = u.id
       JOIN topics t ON sf.topic_id   = t.id
       WHERE t.teacher_id = $1
       ORDER BY sf.submitted_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /detail/:id  — giảng viên xem chi tiết 1 form
// ══════════════════════════════════════════════════════════════════
router.get('/detail/:id', authenticate, requireRole('teacher'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         sf.*,
         u.full_name as student_name,
         u.email    as student_email,
         t.title    as topic_title
       FROM student_forms sf
       JOIN users  u ON sf.student_id = u.id
       JOIN topics t ON sf.topic_id   = t.id
       WHERE sf.id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Không tìm thấy form' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /progress/my  — sinh viên xem tiến độ form của mình
// ══════════════════════════════════════════════════════════════════
router.get('/progress/my', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        t.id AS topic_id,
        t.title,
        t.field,

        u.full_name AS supervisor,

        -- chỉ đếm approved
        COUNT(DISTINCT CASE WHEN r.status = 'approved' THEN r.student_id END)
        AS actual_students,

        MAX(CASE WHEN sf.form_type = 'BM02' THEN sf.status END) AS bm02,

        CASE
          WHEN COUNT(CASE WHEN sf.form_type='BM04' AND sf.status='approved' THEN 1 END)
               >= 6
            THEN 'approved'
          WHEN COUNT(CASE WHEN sf.form_type='BM04' AND sf.status='submitted' THEN 1 END) > 0
            THEN 'submitted'
          WHEN COUNT(CASE WHEN sf.form_type='BM04' AND sf.status='rejected' THEN 1 END) > 0
            THEN 'rejected'
          WHEN COUNT(CASE WHEN sf.form_type='BM04' THEN 1 END) > 0
            THEN 'draft'
          ELSE NULL
        END AS bm04,

        MAX(CASE WHEN sf.form_type = 'BM08' THEN sf.status END) AS bm08

      FROM topics t

      JOIN registrations r
        ON r.topic_id = t.id
       AND r.student_id = $1   -- 🔥 FIX: chỉ lấy của student hiện tại

      LEFT JOIN users u ON t.teacher_id = u.id
      LEFT JOIN student_forms sf ON sf.topic_id = t.id AND sf.student_id = r.student_id

      GROUP BY t.id, t.title, t.field, u.full_name
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ══════════════════════════════════════════════════════════════════
// GET /progress/all  — giảng viên / trưởng bộ môn xem tất cả
// ══════════════════════════════════════════════════════════════════
router.get('/progress/all', authenticate, async (req, res) => {
  const userRole = (req.user.role || '').toLowerCase();
  if (!['teacher', 'head'].includes(userRole)) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  try {
    const role = (req.user.role || '').toLowerCase();
    const isHead = role === 'head';

    const params = [];

    let whereClause = `
      WHERE 1=1
    `;

    if (!isHead) {
      whereClause += ` AND t.teacher_id = $1`;
      params.push(req.user.id);
    }

    const result = await pool.query(
      `
      SELECT
        t.id AS topic_id,
        t.title,
        t.field,
        t.max_students,
        t.status,

        u_t.full_name AS supervisor,

        COUNT(DISTINCT CASE WHEN r.status = 'approved' THEN r.student_id END)
        AS actual_students,

        CASE
  WHEN COUNT(DISTINCT CASE WHEN r.status='approved' THEN r.student_id END)
       =
       COUNT(DISTINCT CASE
         WHEN sf.form_type='BM02'
          AND sf.status='approved'
         THEN sf.student_id
       END)
  THEN 'approved'

  WHEN COUNT(DISTINCT CASE
         WHEN sf.form_type='BM02'
          AND sf.status='submitted'
         THEN sf.student_id
       END) > 0
  THEN 'submitted'

  ELSE NULL
END AS bm02,
        CASE
  WHEN COUNT(CASE WHEN r.status='approved' THEN 1 END) * 6
       <=
       COUNT(CASE
         WHEN sf.form_type='BM04'
          AND sf.status='approved'
         THEN 1
       END)
  THEN 'approved'

  WHEN COUNT(CASE
         WHEN sf.form_type='BM04'
          AND sf.status='submitted'
         THEN 1
       END) > 0
  THEN 'submitted'

  ELSE NULL
END AS bm04,

        MAX(CASE WHEN sf.form_type = 'BM08' THEN sf.status END) AS bm08

      FROM topics t

      LEFT JOIN registrations r
        ON r.topic_id = t.id

      LEFT JOIN users u_t
        ON t.teacher_id = u_t.id

      LEFT JOIN student_forms sf
        ON sf.topic_id = t.id

      ${whereClause}

      GROUP BY
        t.id, t.title, t.field, t.max_students, t.status, u_t.full_name

      HAVING COUNT(DISTINCT CASE WHEN r.status = 'approved' THEN r.student_id END) > 0

      ORDER BY t.id ASC
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;