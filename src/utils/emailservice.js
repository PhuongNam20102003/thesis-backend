const nodemailer = require('nodemailer');
require('dotenv').config();

// Cấu hình Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Gửi email khi được duyệt
const sendApprovedEmail = async (studentEmail, studentName, topicTitle, teacherName) => {
  const mailOptions = {
    from: `"EduThesis System" <${process.env.EMAIL_USER}>`,
    to: studentEmail,
    subject: '✅ Đăng ký đề tài đã được chấp nhận',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1D9E75;">Chúc mừng ${studentName}!</h2>
        <p>Đăng ký đề tài của bạn đã được <strong>chấp nhận</strong>.</p>
        <div style="background: #E1F5EE; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>Đề tài:</strong> ${topicTitle}<br/>
          <strong>Giảng viên hướng dẫn:</strong> ${teacherName}
        </div>
        <p>Vui lòng liên hệ với giảng viên hướng dẫn trong vòng 3 ngày để bắt đầu triển khai.</p>
        <p style="color: #888; font-size: 12px;">Email tự động từ hệ thống EduThesis</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
};

// Gửi email khi bị từ chối
const sendRejectedEmail = async (studentEmail, studentName, topicTitle) => {
  const mailOptions = {
    from: `"EduThesis System" <${process.env.EMAIL_USER}>`,
    to: studentEmail,
    subject: '❌ Đăng ký đề tài không được chấp nhận',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #A32D2D;">Thông báo từ hệ thống</h2>
        <p>Rất tiếc, đăng ký đề tài của <strong>${studentName}</strong> đã bị <strong>từ chối</strong>.</p>
        <div style="background: #FCEBEB; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>Đề tài:</strong> ${topicTitle}
        </div>
        <p>Bạn có thể đăng ký lại đề tài khác trên hệ thống.</p>
        <p style="color: #888; font-size: 12px;">Email tự động từ hệ thống EduThesis</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
};

module.exports = { sendApprovedEmail, sendRejectedEmail };