const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin-model');
const { jwtAccessSecret, jwtRefreshSecret, accessTokenLife, refreshTokenLife, emailConfirmationSecret, passwordResetSecret } = require('../config');
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

    // Create a JWT token to hold the signup data with 5-minute expiration
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

    // Check if the account is banned
    if (admin.lockedAccount == true) {
      return res.status(403).json({ error: 'Account is locked and unusable.'});
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

    // Check if the account is banned
    if (admin.lockedAccount == true) {
      return res.status(403).json({ error: 'Account is locked and unusable.'});
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

// 5.1. Step 1 to edit an admin's password (like the 2 editing email APIs in routes/users.js)
router.put('/edit-password', authenticateAccessToken, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { password } = req.body;

    // Find the admin's details in the database
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
    }

    const isSamePassword = await bcrypt.compare(password, admin.password);
    if (isSamePassword) {
      return res.status(400).json({ error: "New password cannot be the same as the current password." });
    }
    
    // Generate a 6-digit confirmation code
    const confirmationCode = generateConfirmationCode();
    
    // Create a JWT token that stores the admin's id and confirmation code with 5-minute expiry
    const passwordToken = jwt.sign(
      { adminId, confirmationCode },
      passwordResetSecret,
      { expiresIn: '5m' }
    );
    
    // Send the confirmation code to the admin's email address
    await sendConfirmationEmail(admin.email, confirmationCode);
    
    return res.json({ message: 'Confirmation code sent successfully.', passwordToken });
  } catch (error) {
    console.error('Error in /edit-password:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 5.2. Confirm admin's new password. Input the new password from 5.1 API again and not putting it in the token due to security concern
router.put('/confirm-password', authenticateAccessToken, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { passwordToken, confirmationCode, newPassword } = req.body;
    
    if (!passwordToken || !confirmationCode || !newPassword) {
      return res.status(400).json({ error: 'Password token, confirmation code, and new password are required.' });
    }
    
    let payload;
    try {
      payload = jwt.verify(passwordToken, passwordResetSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired password token.' });
    }
    
    // Ensure the token's adminId matches the authenticated admin
    if (payload.adminId.toString() !== adminId.toString()) {
      return res.status(400).json({ error: 'Invalid token for this admin.' });
    }
    
    // Verify that the provided confirmation code matches the token's confirmation code
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update the admin's password in the database
    await Admin.findByIdAndUpdate(adminId, { password: hashedPassword });
    
    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error in /confirm-password:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 6.1. Edit an admin's email
router.put('/edit-email', authenticateAccessToken, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    
    // Generate a 6-digit confirmation code
    const confirmationCode = generateConfirmationCode();
    
    // Create a JWT token that stores the new email, confirmation code, and adminId with a 5m expiry
    const emailToken = jwt.sign(
      { adminId, newEmail: email, confirmationCode },
      emailConfirmationSecret,
      { expiresIn: '5m' }
    );
    
    // Fetch the admin's current record to retrieve the current email
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    // Check if the new email is different from the current one
    const isSameEmail = await bcrypt.compare(email, admin.email);
    if (isSameEmail) {
      return res.status(400).json({ error: "New email cannot be the same as the current email." });
    }
    
    // Send the confirmation code to the new email address
    await sendConfirmationEmail(email, confirmationCode);
    
    return res.json({ message: 'Confirmation code sent successfully.', emailToken });
  } catch (error) {
    console.error('Error in /edit-email:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 6.2. Confirm the admin's new email
router.put('/confirm-email', authenticateAccessToken, async (req, res) => {
  try {
    const adminId = req.admin.id;
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
    
    // Ensure the token's adminId matches the authenticated admin
    if (payload.adminId.toString() !== adminId.toString()) {
      return res.status(400).json({ error: 'Invalid token for this admin.' });
    }
    
    // Check if the provided confirmation code matches the one stored in the token
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Update the admin's email in MongoDB
    const updatedAdmin = await Admin.findByIdAndUpdate(adminId, { email: payload.newEmail }, { new: true });
    
    return res.json({ message: 'Email updated successfully.', admin: updatedAdmin });
  } catch (error) {
    console.error('Error in /confirm-email:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 7. Update an admin's address
router.put('/edit-address', authenticateAccessToken, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { address: newAddress } = req.body;
    
    if (!newAddress) {
      return res.status(400).json({ error: 'New address is required.' });
    }
    
    // Retrieve the current admin record
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }
    
    // Check if the new address is the same as the current one
    if (admin.address === newAddress) {
      return res.status(400).json({ error: 'The new address must be different from the current address.' });
    }
    
    // Update the admin's address
    admin.address = newAddress;
    await admin.save();
    
    return res.json({ message: 'Address updated successfully.', admin });
  } catch (error) {
    console.error('Error in /edit-address:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 8. Toggle an admin account's ban status
router.put('/toggle-locked-account', authenticateAccessToken, async (req, res) => {
  try {
    // Only topadmin can access this API
    if (req.admin.role !== 'topadmin') {
      return res.status(403).json({ error: 'Access denied. Only topadmin can toggle locked account status.' });
    }

    // Get the target admin that needs to be banned or unbanned
    const { targetAdminId } = req.body;
    
    const targetAdmin = await Admin.findById(targetAdminId);
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Target admin not found.' });
    }
    
    // Toggle the lockedAccount field
    targetAdmin.lockedAccount = !targetAdmin.lockedAccount;
    await targetAdmin.save();
    
    return res.json({ message: 'Locked account status updated successfully.', admin: targetAdmin });
  } catch (error) {
    console.error('Error in /toggle-locked-account:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 9.1. Forgot password, take email and send code
router.put('/forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required.' });
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    
    // Check if an admin exists with this email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found with that email.' });
    }

    // Basic password validation
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
    }
    const isSamePassword = await bcrypt.compare(newPassword, admin.password);
    if (isSamePassword) {
      return res.status(400).json({ error: "New password cannot be the same as the current password." });
    }

    // Hash the new password before updating
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Generate a confirmation code
    const confirmationCode = generateConfirmationCode();
    
    // Create a JWT token containing the email and confirmation code with a 5-minute expiry
    const emailToken = jwt.sign(
      { email, confirmationCode, newPassword: hashedPassword },
      passwordResetSecret,
      { expiresIn: '5m' }
    );
    
    // Send the confirmation code to the provided email address
    await sendConfirmationEmail(email, confirmationCode);
    
    return res.json({
      message: 'Confirmation code sent successfully.',
      emailToken
    });
  } catch (error) {
    console.error('Error in /forgot-password:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 9.2. Confirm the code from 9.1. and return the email for editing 
router.put('/confirm-forgot-password', async (req, res) => {
  try {
    const { emailToken, confirmationCode } = req.body;
    
    if (!emailToken || !confirmationCode) {
      return res.status(400).json({ error: 'Email token and confirmation code are required.' });
    }
    
    let payload;
    try {
      payload = jwt.verify(emailToken, passwordResetSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired email token.' });
    }
    
    // Check if the confirmation code provided by the admin matches the one stored in the token
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({ error: 'Invalid confirmation code.' });
    }
    
    // Update the admin's password in the database
    const updatedAdmin = await Admin.findOneAndUpdate(
      { email: payload.email },
      { password: payload.newPassword },
      { new: true }
    );

    if (!updatedAdmin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    // Success - respond with the email from the token so your password update API can use it
    return res.json({
      message: 'Password updated successfully.',
      email: payload.email
    });
  } catch (error) {
    console.error('Error in /admin-confirm-forgot-password:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
