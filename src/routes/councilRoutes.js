const express = require('express');
const router = express.Router();
const { assignReviewer, getCouncilList, getOverview } = require('../controllers/councilController');
const { authenticate, requireRole } = require('../middleware/auth');

router.post('/assign', authenticate, requireRole('head'), assignReviewer);
router.get('/list', authenticate, requireRole('head'), getCouncilList);
router.get('/overview', authenticate, requireRole('head'), getOverview);

module.exports = router;