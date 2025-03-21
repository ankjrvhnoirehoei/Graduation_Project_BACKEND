var express = require('express');
var router = express.Router();
const cloudinary = require('cloudinary').v2;
// cloudinary.config()
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user-model'); 
const { jwtAccessSecret, jwtRefreshSecret, accessTokenLife, refreshTokenLife } = require('../config'); // Token config
const saltRounds = 10; // Number of salt rounds for bcrypt

// 1. Signup 
// Helper function to validate password: at least 8 characters, contains both letters and numbers
function isValidPassword(password) {
  if (password.length < 8) return false;
  // Must contain at least one letter and one number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validations
    if (!username || username.length < 4) {
      return res.status(400).json({ error: 'Username must be at least 4 characters long.' });
    }
    if (!password || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
    }

    // Generate a userID based on current milliseconds
    const userID = String(Date.now());

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken.' });
    }    

    // Generate a refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new user
    const newUser = new User({
      userID,
      username,
      password: hashedPassword,
    });

    // Generate tokens
    const accessToken = jwt.sign(
      { userID: newUser.userID, id: newUser._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );
    const newRefreshToken = jwt.sign(
      { userID: newUser.userID, id: newUser._id },
      jwtRefreshSecret,
      { expiresIn: refreshTokenLife }
    );

    // Save the refresh token to the user record
    newUser.refreshToken = newRefreshToken;
    // Save the user to the database
    await newUser.save();

    // Return success response 
    res.status(201).json({
      message: 'User created successfully.',
      user: {
        id: newUser._id,
        userID: newUser.userID,
        username: newUser.username,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 2. Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Retrieve the user from the database
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    // Verify the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    // Generate new tokens
    const accessToken = jwt.sign(
      { userID: user.userID, id: user._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );
    const refreshToken = jwt.sign(
      { userID: user.userID, id: user._id },
      jwtRefreshSecret,
      { expiresIn: refreshTokenLife }
    );

    // Update user's refreshToken field in the database
    user.refreshToken = refreshToken;
    await user.save();

    // Return tokens and basic user information
    res.status(200).json({
      message: 'Login successful.',
      user: {
        id: user._id,
        userID: user.userID,
        username: user.username,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


module.exports = router;
