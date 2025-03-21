var express = require('express');
var router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const cloudinary = require('cloudinary').v2;
// cloudinary.config()
const Visual = require('../models/visual-model');
const User = require('../models/user-model');
const authenticateRefreshToken = require('../middleware/authenticate'); // Import the jsonwebtoken middleware

// 1. Upload image avatar to cloudinary and update the avatarImg field of the user in the Users schema
router.post('/update-avatar', authenticateRefreshToken, upload.single('avatar'), async (req, res) => {
    try {
        console.log("File received:", req.file); // Debug: log file data
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        // At this point, req.user has been set by the authentication middleware
        const userId = req.user._id;
        
        // Check if the user already has an avatar URL set
        if (req.user.avatarImg) {
            // Find the Visual document that matches this URL
            const previousVisual = await Visual.findOne({ link: req.user.avatarImg });
            if (previousVisual) {
            // Use the visualID (which is the Cloudinary public ID) to delete the old image
            console.log('Deleting previous image with public ID:', previousVisual.visualID);
            await cloudinary.uploader.destroy(previousVisual.visualID);
            
            // Remove the old Visual record if you don't need to keep it
            await Visual.deleteOne({ _id: previousVisual._id });
            }
        }

        // Upload the file to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        public_id: `avatars/${userId}_${Date.now()}`,
        transformation: [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
        ]
        });
        
        // Create a new Visual document in the visuals schema
        const newVisual = await Visual.create({
        visualID: uploadResult.public_id,
        link: uploadResult.secure_url,
        usage: 'user',
        });
        
        // Update the user's avatar image URL in the users schema
        await User.findByIdAndUpdate(userId, { avatarImg: uploadResult.secure_url });
        
        res.json({
        message: 'Avatar updated successfully',
        visual: newVisual,
        avatarUrl: uploadResult.secure_url
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the avatar.' });
    }
});
  
module.exports = router;