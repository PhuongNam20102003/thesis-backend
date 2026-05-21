const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const topicRoutes = require('./routes/topicRoutes');
const regRoutes = require('./routes/regRoutes');
const councilRoutes = require('./routes/councilRoutes');
const formRoutes = require('./routes/formRoutes');

const app = express();

app.use(cors({
  origin: 'https://thesis-frontend-ga1u.vercel.app/',
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/registrations', regRoutes);
app.use('/api/council', councilRoutes);
app.use('/api/forms', formRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({ message: 'EduThesis API đang chạy!' });
});


// Route 404 — đặt CUỐI CÙNG
app.use((req, res) => {
  res.status(404).json({ message: 'Không tìm thấy route này!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});