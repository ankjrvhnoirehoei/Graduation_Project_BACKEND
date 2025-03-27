const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user-model');
const { jwtAccessSecret, jwtRefreshSecret, accessTokenLife } = require('../config');

router.post('/refresh-token', async (req, res) => {
  try {
    // Extract the refresh token from the request body (straight from the database)
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }
    
    // Verify the refresh token using jwtRefreshSecret
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
    
    // Retrieve the user from the database using the decoded info
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }
    
    // Generate a new access token
    const newAccessToken = jwt.sign(
      { id: user._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );

    res.status(200).json({
      message: 'New access token issued.',
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
