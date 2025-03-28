const express = require('express');
const router = express.Router();
const { getAll, getById, createCampaign } = require('../controllers/CampaignController');
const authenticate = require('../middleware/auth');
const upload = require('../middleware/uploadService');

router.route('/')
  .get(getAll)
  .post(authenticate, upload, createCampaign);

router.get('/:id', getById);



module.exports = router;
