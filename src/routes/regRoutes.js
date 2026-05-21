const express = require('express');
const router = express.Router();
const {
  registerTopic, getMyRegistration, cancelRegistration,
  getTopicRegistrations, updateRegistrationStatus,
} = require('../controllers/regController');
const { authenticate, requireRole } = require('../middleware/auth');

router.post('/', authenticate, requireRole('student'), registerTopic);
router.get('/my', authenticate, requireRole('student'), getMyRegistration);
router.delete('/my', authenticate, requireRole('student'), cancelRegistration);
router.get('/pending', authenticate, requireRole('teacher'), getTopicRegistrations);
router.patch('/:id/status', authenticate, requireRole('teacher'), updateRegistrationStatus);

module.exports = router;