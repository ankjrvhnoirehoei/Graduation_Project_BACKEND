var express = require('express');
var router = express.Router();
const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user-model'); 
const { jwtAccessSecret, jwtRefreshSecret, accessTokenLife, refreshTokenLife, emailConfirmationSecret } = require('../config'); 
const authenticateRefreshToken = require('../middleware/authenticate');
const { sendConfirmationEmail } = require('../middleware/emailService');
const saltRounds = 10; // Number of salt rounds for bcrypt

// Helper function to validate password: at least 8 characters, contains both letters and numbers
function isValidPassword(password) {
  if (password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

// Helper function to convert dd/MM/yyyy to Date
function parseDateString(dateStr) {
  const [day, month, year] = dateStr.split('/');
  // Create date string in ISO format (yyyy-MM-dd) for Date constructor.
  const isoDateStr = `${year}-${month}-${day}`;
  const dateObj = new Date(isoDateStr);
  return isNaN(dateObj) ? null : dateObj;
}

// Utility function to generate a 6-digit confirmation code
function generateConfirmationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 1. Signup
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

// 3. Edit user's basic info
router.put('/edit-user', authenticateRefreshToken, async (req, res) => {
  try {
    // Get the authenticated user's id from the middleware
    const userId = req.user._id;
    // Extract fields from the request body
    let { fullName, username, password, dateOfBirth, phoneNum, address } = req.body;

    // Check if username and password follow the same rules as signup
    if (!username || username.length < 4) {
      return res.status(400).json({ error: 'Username must be at least 4 characters long.' });
    }
    if (!password || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
    }

    // Validate username uniqueness (case-sensitive)
    if (username) {
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== userId.toString()) {
        return res.status(400).json({ error: "Username already in use." });
      }
    }

    // Validate and hash password if provided
    if (password) {
      // Retrieve current user data for password comparison
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }
      // Check if the provided password is the same as the current password
      const isSamePassword = await bcrypt.compare(password, user.password);
      if (isSamePassword) {
        return res.status(400).json({ error: "New password cannot be the same as the current password." });
      }
      // Hash the new password before updating
      password = await bcrypt.hash(password, saltRounds);
    }

    // Validate and parse dateOfBirth (expecting dd/MM/yyyy)
    if (dateOfBirth) {
      const parsedDate = parseDateString(dateOfBirth);
      if (!parsedDate) {
        return res.status(400).json({ error: "Invalid date format. Use dd/MM/yyyy." });
      }
      dateOfBirth = parsedDate;
    }

    // Validate phoneNum (all numeric and at least 7 digits)
    if (phoneNum) {
      if (!/^\d{7,}$/.test(phoneNum)) {
        return res.status(400).json({ error: "Invalid phone number. Must be numeric and at least 7 digits." });
      }
    }

    // Build an update object with only the fields provided
    const updateFields = {};
    if (fullName !== undefined) updateFields.fullName = fullName;
    if (username !== undefined) updateFields.username = username;
    if (password !== undefined) updateFields.password = password;
    if (dateOfBirth !== undefined) updateFields.dateOfBirth = dateOfBirth;
    if (phoneNum !== undefined) updateFields.phoneNum = phoneNum;
    if (address !== undefined) updateFields.address = address;

    // Update the user document in the database
    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, { new: true });
    return res.json({ message: "User updated successfully", user: updatedUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * 4.1. Send confirmation code for email update.
 *
 * Endpoint: PUT /edit-email
 * Middleware: authenticateRefreshToken (to get req.user._id)
 *
 * Expected request body:
 *   { email: "new-email@example.com" }
 *
 * Workflow:
 *  - Validate the new email format
 *  - Generate a confirmation code
 *  - Create a JWT token with { newEmail, confirmationCode, userId } with a 10-minute expiration
 *  - Send the confirmation code to the new email using Nodemailer
 *  - Return the token to the client (or set it as a cookie) for later verification
 */
router.put('/edit-email', authenticateRefreshToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    
    // Basic email validation (backend check)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    
    // Generate a 6-digit confirmation code
    const confirmationCode = generateConfirmationCode();
    
    // Create a JWT token that stores the new email and confirmation code with 10m expiry
    const emailToken = jwt.sign(
      { userId, newEmail: email, confirmationCode },
      emailConfirmationSecret, // Use a dedicated secret or reuse one from config
      { expiresIn: '10m' }
    );
    
    // Send the confirmation code to the new email address
    await sendConfirmationEmail(email, confirmationCode);
    
    // Return the token to the client so that it can be used in the confirmation step.
    // In production, consider storing this token in an HTTP-only cookie or secure storage.
    return res.json({ message: 'Confirmation code sent successfully.', emailToken });
  } catch (error) {
    console.error('Error in /edit-email:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 4.2. Confirm the code and update the user's email.
 *
 * Endpoint: PUT /confirm-email
 * Middleware: authenticateRefreshToken (to get req.user._id)
 *
 * Expected request body:
 *   { emailToken: "<JWT token>", confirmationCode: "123456" }
 *
 * Workflow:
 *  - Verify the JWT token and retrieve the stored data (newEmail, confirmationCode, userId)
 *  - Compare the provided confirmation code with the code stored in the token
 *  - If valid and not expired, update the user's email in MongoDB
 */
router.put('/confirm-email', authenticateRefreshToken, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { emailToken, confirmationCode } = req.body;
    
    if (!emailToken || !confirmationCode) {
      return res.status(400).json({ error: 'Email token and confirmation code are required.' });
    }
    
    let payload;
    try {
      payload = jwt.verify(emailToken, emailConfirmationSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired email token.' });
    }
    
    // Ensure that the token's userId matches the authenticated user
    if (payload.userId.toString() !== currentUserId.toString()) {
      return res.status(400).json({ error: 'Invalid token for this user.' });
    }    
    
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }

    console.log('Payload userId:', payload.userId.toString());
    console.log('Current userId:', currentUserId.toString());

    
    // Update the user's email in MongoDB
    const updatedUser = await User.findByIdAndUpdate(currentUserId, { email: payload.newEmail }, { new: true });
    
    return res.json({ message: 'Email updated successfully.', user: updatedUser });
  } catch (error) {
    console.error('Error in /confirm-email:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
