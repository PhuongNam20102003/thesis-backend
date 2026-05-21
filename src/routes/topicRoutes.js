const express = require('express');
const router = express.Router();
const { 
  getAllTopics, getMyTopics, createTopic, deleteTopic, getTeachers,
  getPendingTopics, approveOrRejectTopic, updateTopic
} = require('../controllers/topicController');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', authenticate, getAllTopics);
router.get('/my', authenticate, requireRole('teacher'), getMyTopics);
router.get('/teachers', authenticate, getTeachers);
router.get('/pending', authenticate, requireRole('head'), getPendingTopics);
router.post('/', authenticate, requireRole('teacher'), createTopic);
router.put('/:id', authenticate, requireRole('teacher'), updateTopic);
router.patch('/:id/status', authenticate, requireRole('head'), approveOrRejectTopic);
router.delete('/:id', authenticate, requireRole('teacher'), deleteTopic);

module.exports = router;