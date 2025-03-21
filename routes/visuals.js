var express = require('express');
var router = express.Router();
const cloudinary = require('cloudinary').v2;
// cloudinary.config()

/* POST upload image to Cloudinary */
router.post('/upload', async function(req, res, next) {
    try {
      const imageUrl = 'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg';
      
      // Upload the image
      const uploadResult = await cloudinary.uploader.upload(imageUrl, {
        public_id: 'shoes'
      });
      
      // Generate an optimized delivery URL (auto format and quality)
      const optimizeUrl = cloudinary.url('shoes', {
        fetch_format: 'auto',
        quality: 'auto'
      });
      
      // Generate a transformed image: auto-crop to a square (500x500)
      const autoCropUrl = cloudinary.url('shoes', {
        crop: 'auto',
        gravity: 'auto',
        width: 500,
        height: 500
      });
      
      // Return the results in JSON format
      res.json({
        uploadResult,
        optimizeUrl,
        autoCropUrl
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'An error occurred during the upload process.' });
    }
  });

  module.exports = router;