const express = require('express');
const router  = express.Router();
const {
  register, login, getMe, updateProfile, changePassword,
  adminGetUsers, adminCreateUser, adminUpdateUser, adminDeleteUser,
} = require('../controllers/authController');
const { authenticate, requireRole } = require('../middleware/auth');

router.post('/login',           login);
router.get ('/me',              authenticate, getMe);
router.put ('/profile',         authenticate, updateProfile);
router.put ('/change-password', authenticate, changePassword);

router.get   ('/admin/users',     authenticate, requireRole('admin'), adminGetUsers);
router.post  ('/admin/users',     authenticate, requireRole('admin'), adminCreateUser);
router.patch ('/admin/users/:id', authenticate, requireRole('admin'), adminUpdateUser);
router.delete('/admin/users/:id', authenticate, requireRole('admin'), adminDeleteUser);

module.exports = router;