const express = require('express');
const router = express.Router();
const { getAll, getById, createCampaign } = require('../controllers/CampaignController');
const authenticate = require('../middleware/authUser');
const multer = require('multer');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  }
});

router.use(express.json()); 
router.get('/', getAll);

router.route('/:id')
  .get(getById)
  .put(updateCampaign)
;

router.post('/new', 
  authenticate, 
  upload.array('mediaFiles', 10), 
  createCampaign
);

module.exports = router;
