const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin-model');
const { jwtAccessSecret, jwtRefreshSecret, accessTokenLife, refreshTokenLife, emailConfirmationSecret } = require('../config');
const authenticateAccessToken = require('../middleware/authAdmin');
const { sendConfirmationEmail } = require('../middleware/emailService');
const { isValidPassword, generateConfirmationCode } = require('../controllers/helperFunctions');

const saltRounds = 10;

/**
 * 1.1. Topadmin Signup - Step 1
 *
 * Endpoint: POST /topadmin/signup
 *
 * Request body:
 *   { email: "admin@example.com", password: "password123" }
 *
 * Workflow:
 *  - Validate email and password.
 *  - Check if an admin with the given email already exists.
 *  - Hash the password using bcrypt.
 *  - Generate a 6-digit confirmation code.
 *  - Create a JWT token containing { email, hashedPassword, confirmationCode, role: 'topadmin' } with 5m expiry.
 *  - Send the confirmation code to the email.
 *  - Return the emailToken to the client.
 */
router.post('/topadmin/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Validate password
    if (!password || !isValidPassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain both letters and numbers.'
      });
    }

    // Check if admin with this email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate confirmation code
    const confirmationCode = generateConfirmationCode();

    // Create a JWT token to hold the signup data with 10-minute expiration
    const emailToken = jwt.sign(
      { email, hashedPassword, confirmationCode, role: 'topadmin' },
      emailConfirmationSecret,
      { expiresIn: '5m' }
    );

    // Send the confirmation code to the provided email
    await sendConfirmationEmail(email, confirmationCode);

    // Return the emailToken to the client
    res.status(200).json({ message: 'Confirmation code sent successfully.', emailToken });
  } catch (error) {
    console.error('Error in topadmin signup step 1:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 1.2. Topadmin Signup - Step 2
 *
 * Endpoint: POST /topadmin/confirm-signup
 *
 * Request body:
 *   { emailToken: "<JWT token>", confirmationCode: "123456" }
 *
 * Workflow:
 *  - Verify the JWT token and extract the stored data (email, hashedPassword, confirmationCode, role).
 *  - Compare the provided confirmation code with the one in the token.
 *  - If they match and the token is valid, create a new admin account with role "topadmin".
 */
router.post('/topadmin/confirm-signup', async (req, res) => {
  try {
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
    
    // Compare the confirmation code from the payload with the provided one
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Double-check that the admin has not been created in the meantime
    const existingAdmin = await Admin.findOne({ email: payload.email });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists.' });
    }
    
    // Create the new topadmin record in the database
    const newAdmin = new Admin({
      email: payload.email,
      password: payload.hashedPassword,
      role: payload.role, // topadmin
    });

    // Generate tokens
    const accessToken = jwt.sign(
      { id: newAdmin._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );
    const newRefreshToken = jwt.sign(
      { id: newAdmin._id },
      jwtRefreshSecret,
      { expiresIn: refreshTokenLife }
    );

    // Save the refresh token to the admin record
    newAdmin.refreshToken = newRefreshToken;
    
    await newAdmin.save();
    
    res.status(201).json({
      message: 'Top admin account created successfully.',
      admin: { id: newAdmin._id, email: newAdmin.email, role: newAdmin.role },
      accessToken, newRefreshToken
    });
  } catch (error) {
    console.error('Error in topadmin confirm-signup:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 2.1. Top Admin Login - Step 1: Validate credentials and send confirmation code.
 *
 * Endpoint: POST /topadmin/login
 *
 * Request body:
 *   { email: "admin@example.com", password: "password123" }
 *
 * Workflow:
 *  - Validate email and password.
 *  - Check that a top admin with this email exists and that the password is correct.
 *  - Generate a 6-digit confirmation code.
 *  - Create an email token with { adminId, email, confirmationCode } (expires in 5 minutes).
 *  - Generate an access token for subsequent confirmation (using the existing jwtAccessSecret).
 *  - Send the confirmation code to the admin's email.
 *  - Return both tokens to the client.
 */
router.post('/topadmin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    
    // Find top admin by email and ensure the role is topadmin
    const admin = await Admin.findOne({ email, role: 'topadmin' });
    if (!admin) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    
    // Validate password with bcrypt
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    
    // Generate a confirmation code
    const confirmationCode = generateConfirmationCode();
    
    // Create a JWT (email token) with adminId, email, and confirmationCode (1m expiry)
    const emailToken = jwt.sign(
      { adminId: admin._id, email: admin.email, confirmationCode },
      emailConfirmationSecret,
      { expiresIn: '5m' }
    );
    
    // Generate an access token for subsequent confirmation step
    const accessToken = jwt.sign(
      { id: admin._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );
    
    // Send the confirmation code via email using the existing service
    await sendConfirmationEmail(admin.email, confirmationCode);
    
    // Return tokens to the client
    res.status(200).json({
      message: 'Confirmation code sent to email.',
      emailToken,
      accessToken
    });
    
  } catch (error) {
    console.error('Error in topadmin login step 1:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 2.2. Top Admin Login - Step 2: Confirm code and return full admin details.
 *
 * Endpoint: POST /topadmin/confirm-login
 *
 * Request body:
 *   { emailToken: "<JWT token>", confirmationCode: "123456" }
 *
 * Workflow:
 *  - This endpoint is protected by authenticateAccessToken middleware, so req.admin is already set.
 *  - Verify the provided emailToken and extract stored data (adminId, email, confirmationCode).
 *  - Confirm that the adminId in the token matches the authenticated admin (from req.admin).
 *  - Check that the provided confirmation code matches the one in the token.
 *  - If valid, return the full admin details.
 */
router.post('/topadmin/confirm-login', authenticateAccessToken, async (req, res) => {
  try {
    const { emailToken, confirmationCode } = req.body;
    
    if (!emailToken || !confirmationCode) {
      return res.status(400).json({ error: 'Email token and confirmation code are required.' });
    }

    if (req.admin.role.toString() !== 'topadmin') {
      return res.status(403).json({ error: 'Unauthorized admin level.' });
    }
    
    let payload;
    try {
      payload = jwt.verify(emailToken, emailConfirmationSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired email token.' });
    }
    
    // Ensure the token's adminId matches the one in the access token (from req.admin)
    if (payload.adminId.toString() !== req.admin._id.toString()) {
      return res.status(400).json({ error: 'Invalid token for this admin.' });
    }
    
    // Validate the confirmation code
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Retrieve full admin details from the database
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    // Generate new refresh token per login
    const refreshToken = jwt.sign(
      { id: admin._id },
      jwtRefreshSecret,
      { expiresIn: refreshTokenLife }
    );

    // Save the new refresh token
    admin.refreshToken = refreshToken;
    await admin.save();
    
    // Return admin details (omit sensitive fields such as password)
    res.status(200).json({
      message: 'Login confirmed successfully.',
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        address: admin.address,
        lockedAccount: admin.lockedAccount,
      }
    });
    
  } catch (error) {
    console.error('Error in topadmin confirm login:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 3.1. Local Admin Signup - Step 1
 *
 * Endpoint: POST /localadmin/signup
 *
 * Request body:
 *   { email: "localadmin@example.com", password: "password123" }
 *
 * Workflow:
 *  - Only a topadmin (from req.admin) is allowed to create a local admin.
 *  - Validate email and password.
 *  - Check if an admin with the given email already exists.
 *  - Hash the password using bcrypt.
 *  - Generate a 6-digit confirmation code.
 *  - Create a JWT token containing { email, hashedPassword, confirmationCode, role: 'localadmin' } with a 5-minute expiry.
 *  - Send the confirmation code to the provided email.
 *  - Return the emailToken to the client.
 */
router.post('/localadmin/signup', authenticateAccessToken, async (req, res) => {
  try {
    // Only top admins can create a local admin
    if (req.admin.role !== 'topadmin') {
      return res.status(403).json({ error: 'Unauthorized admin level.' });
    }
    
    const { email, password } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Validate password
    if (!password || !isValidPassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain both letters and numbers.'
      });
    }

    // Check if admin with this email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate confirmation code
    const confirmationCode = generateConfirmationCode();

    // Create a JWT token to hold the signup data with 5-minute expiration
    const emailToken = jwt.sign(
      { email, hashedPassword, confirmationCode, role: 'localadmin' },
      emailConfirmationSecret,
      { expiresIn: '5m' }
    );

    // Send the confirmation code to the provided email
    await sendConfirmationEmail(email, confirmationCode);

    // Return the emailToken to the client
    res.status(200).json({ message: 'Confirmation code sent successfully.', emailToken });
  } catch (error) {
    console.error('Error in local admin signup step 1:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 3.2. Local Admin Signup - Step 2
 *
 * Endpoint: POST /localadmin/confirm-signup
 *
 * Request body:
 *   { emailToken: "<JWT token>", confirmationCode: "123456" }
 *
 * Workflow:
 *  - Only a topadmin (from req.admin) is allowed to confirm the creation of a local admin.
 *  - Verify the provided emailToken and extract the stored data (email, hashedPassword, confirmationCode, role).
 *  - Compare the provided confirmation code with the one in the token.
 *  - If valid and the admin does not exist yet, create a new admin record with role "localadmin".
 *  - Generate an access token and a refresh token.
 *  - Save the refresh token to the admin record and return the new tokens and admin details.
 */
router.post('/localadmin/confirm-signup', authenticateAccessToken, async (req, res) => {
  try {
    // Only topadmins can confirm local admin creation
    if (req.admin.role !== 'topadmin') {
      return res.status(403).json({ error: 'Unauthorized admin level.' });
    }

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
    
    // Compare the confirmation code from the payload with the provided one
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Double-check that the admin has not been created in the meantime
    const existingAdmin = await Admin.findOne({ email: payload.email });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists.' });
    }
    
    // Create the new local admin record in the database
    const newAdmin = new Admin({
      email: payload.email,
      password: payload.hashedPassword,
      role: payload.role, // should be 'localadmin'
    });

    // Generate tokens for the new local admin
    const accessToken = jwt.sign(
      { id: newAdmin._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );
    const newRefreshToken = jwt.sign(
      { id: newAdmin._id },
      jwtRefreshSecret,
      { expiresIn: refreshTokenLife }
    );

    // Save the new refresh token
    newAdmin.refreshToken = newRefreshToken;
    await newAdmin.save();
    
    // Return success response with the new local admin details and tokens
    res.status(201).json({
      message: 'Local admin account created successfully.',
      admin: { id: newAdmin._id, email: newAdmin.email, role: newAdmin.role },
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Error in local admin confirm-signup:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 4.1. Local Admin Login - Step 1: Validate credentials and send confirmation code.
 *
 * Endpoint: POST /localadmin/login
 *
 * Request body:
 *   { email: "localadmin@example.com", password: "password123" }
 *
 * Workflow:
 *  - Validate email and password.
 *  - Check that a local admin with this email exists and that the password is correct.
 *  - Generate a 6-digit confirmation code.
 *  - Create an email token with { adminId, email, confirmationCode } (expires in 5 minutes).
 *  - Generate an access token for subsequent confirmation (using the existing jwtAccessSecret).
 *  - Send the confirmation code to the admin's email.
 *  - Return both tokens to the client.
 */
router.post('/localadmin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    
    // Find local admin by email and ensure the role is localadmin
    const admin = await Admin.findOne({ email, role: 'localadmin' });
    if (!admin) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    
    // Validate password with bcrypt
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    
    // Generate a confirmation code
    const confirmationCode = generateConfirmationCode();
    
    // Create a JWT (email token) with adminId, email, and confirmationCode (5m expiry)
    const emailToken = jwt.sign(
      { adminId: admin._id, email: admin.email, confirmationCode },
      emailConfirmationSecret,
      { expiresIn: '5m' }
    );
    
    // Generate an access token for subsequent confirmation step
    const accessToken = jwt.sign(
      { id: admin._id },
      jwtAccessSecret,
      { expiresIn: accessTokenLife }
    );
    
    // Send the confirmation code via email using the existing service
    await sendConfirmationEmail(admin.email, confirmationCode);
    
    // Return tokens to the client
    res.status(200).json({
      message: 'Confirmation code sent to email.',
      emailToken,
      accessToken
    });
    
  } catch (error) {
    console.error('Error in localadmin login step 1:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * 4.2. Local Admin Login - Step 2: Confirm code and return full admin details.
 *
 * Endpoint: POST /localadmin/confirm-login
 *
 * Request body:
 *   { emailToken: "<JWT token>", confirmationCode: "123456" }
 *
 * Workflow:
 *  - This endpoint is protected by authenticateAccessToken middleware, so req.admin is already set.
 *  - Verify the provided emailToken and extract stored data (adminId, email, confirmationCode).
 *  - Confirm that the adminId in the token matches the authenticated admin (from req.admin).
 *  - Check that the provided confirmation code matches the one in the token.
 *  - If valid, generate a new refresh token, save it, and return the full admin details.
 */
router.post('/localadmin/confirm-login', authenticateAccessToken, async (req, res) => {
  try {
    const { emailToken, confirmationCode } = req.body;
    
    if (!emailToken || !confirmationCode) {
      return res.status(400).json({ error: 'Email token and confirmation code are required.' });
    }

    // Ensure that the current admin (attached by middleware) is a local admin
    if (req.admin.role !== 'localadmin') {
      return res.status(403).json({ error: 'Unauthorized admin level.' });
    }
    
    let payload;
    try {
      payload = jwt.verify(emailToken, emailConfirmationSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired email token.' });
    }
    
    // Ensure the token's adminId matches the one in the access token (from req.admin)
    if (payload.adminId.toString() !== req.admin._id.toString()) {
      return res.status(400).json({ error: 'Invalid token for this admin.' });
    }
    
    // Validate the confirmation code
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Retrieve full admin details from the database
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    // Generate new refresh token per login
    const refreshToken = jwt.sign(
      { id: admin._id },
      jwtRefreshSecret,
      { expiresIn: refreshTokenLife }
    );

    // Save the new refresh token
    admin.refreshToken = refreshToken;
    await admin.save();
    
    // Return admin details (omit sensitive fields such as password)
    res.status(200).json({
      message: 'Login confirmed successfully.',
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        address: admin.address,
        lockedAccount: admin.lockedAccount,
      },
      // Optionally include tokens in the response if needed:
      refreshToken
    });
    
  } catch (error) {
    console.error('Error in localadmin confirm login:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
