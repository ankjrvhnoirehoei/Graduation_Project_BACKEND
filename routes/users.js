var express = require('express');
var router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user-model');
const Campaign = require('../models/campaign-model');
const {
  jwtAccessSecret,
  jwtRefreshSecret,
  accessTokenLife,
  refreshTokenLife,
  emailConfirmationSecret,
  passwordResetSecret,
} = require('../config');
const authenticateAccessToken = require('../middleware/authUser');
const {sendConfirmationEmail} = require('../middleware/emailService');
const {
  isValidPassword,
  parseDateString,
  generateConfirmationCode,
  creditActions,
} = require('../controllers/helperFunctions');
const passport = require('../middleware/passport');
const session = require('express-session');
const saltRounds = 10;
router.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false
}));

router.use(passport.initialize());
router.use(passport.session());

// 1. Signup
router.post('/signup', async (req, res) => {
  try {
    const {username, password} = req.body;

    // Basic validations
    if (!username || username.length < 4) {
      return res
        .status(400)
        .json({error: 'Username must be at least 4 characters long.'});
    }
    if (!password || !isValidPassword(password)) {
      return res
        .status(400)
        .json({
          error:
            'Password must be at least 8 characters long and contain both letters and numbers.',
        });
    }

    // Check if username already exists
    const existingUser = await User.findOne({username});
    if (existingUser) {
      return res.status(400).json({error: 'Username already taken.'});
    }

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new user
    const newUser = new User({
      username,
      password: hashedPassword,
    });

    // Generate tokens
    const accessToken = jwt.sign({id: newUser._id}, jwtAccessSecret, {
      expiresIn: accessTokenLife,
    });
    const newRefreshToken = jwt.sign({id: newUser._id}, jwtRefreshSecret, {
      expiresIn: refreshTokenLife,
    });

    // Save the refresh token to the user record
    newUser.refreshToken = newRefreshToken;
    // Save the user to the database
    await newUser.save();

    // Return success response
    res.status(201).json({
      message: 'User created successfully.',
      user: {
        id: newUser._id,
        username: newUser.username,
      },
      accessToken,
      newRefreshToken,
    });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({error: 'Internal server error.'});
  }
});

// 2.1. Login by entering the username and password and renew access token and refresh token
router.post('/login', async (req, res) => {
  try {
    const {username, password} = req.body;

    // Validate required fields
    if (!username || !password) {
      return res
        .status(400)
        .json({error: 'Username and password are required.'});
    }

    // Retrieve the user from the database
    const user = await User.findOne({username});
    if (!user) {
      return res.status(400).json({error: 'Invalid username or password.'});
    }

    if (user.lockedAccount == true) {
      return res.status(403).json({error: 'Account is locked and unusable.'});
    }

    // Verify the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({error: 'Invalid username or password.'});
    }

    // Generate new tokens
    const accessToken = jwt.sign({id: user._id}, jwtAccessSecret, {
      expiresIn: accessTokenLife,
    });
    const refreshToken = jwt.sign({id: user._id}, jwtRefreshSecret, {
      expiresIn: refreshTokenLife,
    });

    // Update user's refreshToken field in the database
    user.refreshToken = refreshToken;
    await user.save();

    // Return tokens and basic user information
    res.status(200).json({
      message: 'Login successful.',
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({error: 'Internal server error.'});
  }
});

// 2.2. Validate access token from 2.1
router.get('/me', authenticateAccessToken, async (req, res) => {
  try {
    // req.user is attached by the authentication middleware
    const user = req.user;

    res.status(200).json({
      message: 'User details retrieved successfully.',
      user: {
        id: user._id,
        fullName: user.fullName,
        credit: user.credit,
        isKYC: user.isKYC,
        email: user.email,
        username: user.username,
        password: user.password,
        avatarImg: user.avatarImg,
        dateOfBirth: user.dateOfBirth,
        phoneNum: user.phoneNum,
        address: user.address,
      },
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({error: 'Internal server error.'});
  }
});

// 2.3. Refresh access token using refresh token
router.post('/refresh-access-token', async (req, res) => {
  try {
    // Get the refresh token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({error: 'Refresh token is required.'});
    }

    const refreshToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!refreshToken) {
      return res.status(401).json({error: 'Refresh token is required.'});
    }

    // Verify the refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch (err) {
      return res.status(401).json({error: 'Invalid or expired refresh token.'});
    }

    // Find the user by ID from the token
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({error: 'User not found.'});
    }

    // Check if the refresh token matches the one stored in the database
    if (user.refreshToken !== refreshToken) {
      return res.status(401).json({error: 'Invalid refresh token.'});
    }

    // Check if account is locked
    if (user.lockedAccount === true) {
      return res.status(403).json({error: 'Account is locked and unusable.'});
    }

    // Generate new tokens
    const newAccessToken = jwt.sign({id: user._id}, jwtAccessSecret, {
      expiresIn: accessTokenLife,
    });

    const newRefreshToken = jwt.sign({id: user._id}, jwtRefreshSecret, {
      expiresIn: refreshTokenLife,
    });

    // Update the refresh token in the database
    user.refreshToken = newRefreshToken;
    await user.save();

    // Return the new tokens
    res.status(200).json({
      message: 'Tokens refreshed successfully.',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Error during token refresh:', error);
    res.status(500).json({error: 'Internal server error.'});
  }
});

// 2.4. Check refresh token validity
router.post('/check-refresh-token', async (req, res) => {
  try {
    // Get the refresh token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({valid: false, message: 'Refresh token is required.'});
    }

    const refreshToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!refreshToken) {
      return res
        .status(401)
        .json({valid: false, message: 'Refresh token is required.'});
    }

    // Verify the refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch (err) {
      return res
        .status(401)
        .json({valid: false, message: 'Invalid or expired refresh token.'});
    }

    // Find the user by ID from the token
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({valid: false, message: 'User not found.'});
    }

    // Check if the refresh token matches the one stored in the database
    if (user.refreshToken !== refreshToken) {
      return res
        .status(401)
        .json({valid: false, message: 'Invalid refresh token.'});
    }

    // Check if account is locked
    if (user.lockedAccount === true) {
      return res
        .status(403)
        .json({valid: false, message: 'Account is locked and unusable.'});
    }

    // Return success if all checks pass
    res.status(200).json({
      valid: true,
      message: 'Refresh token is valid.',
      user: {
        id: user._id,
        fullName: user.fullName,
        credit: user.credit,
        isKYC: user.isKYC,
        email: user.email,
        username: user.username,
        avatarImg: user.avatarImg,
        dateOfBirth: user.dateOfBirth,
        phoneNum: user.phoneNum,
        address: user.address,
      },
    });
  } catch (error) {
    console.error('Error during refresh token check:', error);
    res.status(500).json({valid: false, message: 'Internal server error.'});
  }
});

router.post('/auth/google/mobile', async (req, res) => {
  try {
    const { googleToken } = req.body;
    
    if (!googleToken) {
      return res.status(400).json({ error: 'Google token is required' });
    }

    // Verify the Google token by calling Google's tokeninfo endpoint
    const fetch = require('node-fetch');
    const googleResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${googleToken}`);
    const googleData = await googleResponse.json();
    
    if (!googleResponse.ok || googleData.error) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    // Get user info from Google
    const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${googleToken}`);
    const userInfo = await userInfoResponse.json();
    
    if (!userInfoResponse.ok) {
      return res.status(401).json({ error: 'Failed to get user info from Google' });
    }

    // Check if user already exists with this Google ID
    let existingUser = await User.findOne({ googleId: userInfo.id });
    
    if (existingUser) {
      // Generate your app's tokens
      const accessToken = jwt.sign({id: existingUser._id}, jwtAccessSecret, {
        expiresIn: accessTokenLife,
      });
      const refreshToken = jwt.sign({id: existingUser._id}, jwtRefreshSecret, {
        expiresIn: refreshTokenLife,
      });

      existingUser.refreshToken = refreshToken;
      await existingUser.save();

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: existingUser._id,
          email: existingUser.email,
          fullName: existingUser.fullName,
          avatarImg: existingUser.avatarImg
        }
      });
    }

    // Check if user exists with the same email (to link accounts)
    const existingEmailUser = await User.findOne({ email: userInfo.email });
    
    if (existingEmailUser) {
      // Link the Google account to existing user
      existingEmailUser.googleId = userInfo.id;
      existingEmailUser.loginMethod = 'google';
      if (!existingEmailUser.fullName) existingEmailUser.fullName = userInfo.name;
      if (!existingEmailUser.avatarImg) existingEmailUser.avatarImg = userInfo.picture;
      
      const accessToken = jwt.sign({id: existingEmailUser._id}, jwtAccessSecret, {
        expiresIn: accessTokenLife,
      });
      const refreshToken = jwt.sign({id: existingEmailUser._id}, jwtRefreshSecret, {
        expiresIn: refreshTokenLife,
      });

      existingEmailUser.refreshToken = refreshToken;
      await existingEmailUser.save();

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: existingEmailUser._id,
          email: existingEmailUser.email,
          fullName: existingEmailUser.fullName,
          avatarImg: existingEmailUser.avatarImg
        }
      });
    }

    // Create new user
    const newUser = new User({
      googleId: userInfo.id,
      fullName: userInfo.name,
      username: userInfo.name,
      email: userInfo.email,
      avatarImg: userInfo.picture,
      loginMethod: 'google'
    });

    await newUser.save();

    const accessToken = jwt.sign({id: newUser._id}, jwtAccessSecret, {
      expiresIn: accessTokenLife,
    });
    const refreshToken = jwt.sign({id: newUser._id}, jwtRefreshSecret, {
      expiresIn: refreshTokenLife,
    });

    newUser.refreshToken = refreshToken;
    await newUser.save();

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: newUser._id,
        email: newUser.email,
        fullName: newUser.fullName,
        avatarImg: newUser.avatarImg
      }
    });

  } catch (error) {
    console.error('Error in mobile Google auth:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2.5. Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    // Get the refresh token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({error: 'Refresh token is required.'});
    }

    const refreshToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!refreshToken) {
      return res.status(401).json({error: 'Refresh token is required.'});
    }

    // Verify the refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch (err) {
      return res.status(401).json({error: 'Invalid or expired refresh token.'});
    }

    // Find the user and clear their refresh token
    const user = await User.findById(payload.id);
    if (user) {
      user.refreshToken = '';
      await user.save();
    }

    res.status(200).json({message: 'Logout successful.'});
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({error: 'Internal server error.'});
  }
});

// 3. Edit user's basic info
router.put('/edit-user', authenticateAccessToken, async (req, res) => {
  try {
    const userId = req.user._id;
    // Extract fields from the request body
    let {
      fullName,
      username,
      password,
      dateOfBirth,
      phoneNum,
      address,
      lockedAccount,
    } = req.body;

    // Validate username if provided
    if (username !== undefined) {
      if (!username || username.length < 4) {
        return res
          .status(400)
          .json({error: 'Username must be at least 4 characters long.'});
      }
    }
    
    // Validate password if provided
    if (password !== undefined) {
      if (!password || !isValidPassword(password)) {
        return res
          .status(400)
          .json({
            error:
              'Password must be at least 8 characters long and contain both letters and numbers.',
          });
      }
    }

    // Validate username uniqueness (case-sensitive)
    if (username) {
      const existingUser = await User.findOne({username});
      if (existingUser && existingUser._id.toString() !== userId.toString()) {
        return res.status(400).json({error: 'Username already in use.'});
      }
    }

    // Validate and hash password if provided
    if (password) {
      // Retrieve current user data for password comparison
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({error: 'User not found.'});
      }
      // Check if the provided password is the same as the current password
      const isSamePassword = await bcrypt.compare(password, user.password);
      if (isSamePassword) {
        return res
          .status(400)
          .json({
            error: 'New password cannot be the same as the current password.',
          });
      }
      // Hash the new password before updating
      password = await bcrypt.hash(password, saltRounds);
    }

    // Validate and parse dateOfBirth (expecting dd/MM/yyyy)
    if (dateOfBirth) {
      const parsedDate = parseDateString(dateOfBirth);
      if (!parsedDate) {
        return res
          .status(400)
          .json({error: 'Invalid date format. Use dd/MM/yyyy.'});
      }
      dateOfBirth = parsedDate;
    }

    // Validate phoneNum (all numeric and at least 7 digits)
    if (phoneNum) {
      if (!/^\d{7,}$/.test(phoneNum)) {
        return res
          .status(400)
          .json({
            error:
              'Invalid phone number. Must be numeric and at least 7 digits.',
          });
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
    if (lockedAccount !== undefined) updateFields.lockedAccount = lockedAccount;

    // Update the user document in the database
    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, {
      new: true,
    });
    return res.json({message: 'User updated successfully', user: updatedUser});
  } catch (err) {
    console.error(err);
    return res.status(500).json({error: 'Internal server error.'});
  }
});

/**
 * 4.1. Send confirmation code for email update.
 *
 * Endpoint: PUT /edit-email
 * Middleware: authenticateAccessToken (to get req.user._id)
 *
 * Expected request body:
 *   { email: "new-email@example.com" }
 *
 * Workflow:
 *  - Validate the new email format
 *  - Generate a confirmation code
 *  - Create a JWT token with { newEmail, confirmationCode, userId } with a 5-minute expiration
 *  - Send the confirmation code to the new email using Nodemailer
 *  - Return the token to the client (or set it as a cookie) for later verification
 */
router.put('/edit-email', authenticateAccessToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const {email} = req.body;

    if (!email) {
      return res.status(400).json({error: 'Email is required.'});
    }

    // Basic email validation (backend check) - ĐỔI VỊ TRÍ LÊN TRÊN
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({error: 'Invalid email format.'});
    }

    // Fetch the user's current record to retrieve the current email - ĐỔI VỊ TRÍ LÊN TRÊN
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({error: 'User not found.'});
    }

    // Check if the new email is different from the current one - SỬA LOGIC NÀY
    if (email === user.email) {
      return res
        .status(400)
        .json({error: 'New email cannot be the same as the current email.'});
    }

    // Check if email already exists for another user - ĐỔI VỊ TRÍ XUỐNG DƯỚI
    const existedEmail = await User.findOne({email, _id: {$ne: userId}});
    if (existedEmail) {
      return res.status(400).json({error: 'Email already exists.'});
    }

    // Generate a 6-digit confirmation code
    const confirmationCode = generateConfirmationCode();

    // Create a JWT token that stores the new email and confirmation code with 5m expiry
    const emailToken = jwt.sign(
      {userId, newEmail: email, confirmationCode},
      emailConfirmationSecret,
      {expiresIn: '5m'},
    );

    // Send the confirmation code to the new email address - THÊM TRY-CATCH
    console.log('Attempting to send email to:', email);
    console.log('Confirmation code:', confirmationCode);
    
    // Tạm thời chỉ log ra console để test
    console.log('=== EMAIL CONFIRMATION ===');
    console.log('To:', email);
    console.log('Subject: Email Confirmation Code');
    console.log('Code:', confirmationCode);
    console.log('========================');
    
    try {
      await sendConfirmationEmail(email, confirmationCode);
      console.log('Email sent successfully!');
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      console.log('Email service temporarily disabled for testing');
      // return res.status(500).json({error: 'Failed to send confirmation email.'});
    }

    // Return the token to the client so that it can be used in the confirmation step.
    return res.json({
      message: 'Confirmation code sent successfully.',
      emailToken,
    });
  } catch (error) {
    console.error('Error in /edit-email:', error);
    return res.status(500).json({error: 'Internal server error.'});
  }
});

/**
 * 4.2. Confirm the code and update the user's email.
 *
 * Endpoint: PUT /confirm-email
 * Middleware: authenticateAccessToken (to get req.user._id)
 *
 * Expected request body:
 *   { emailToken: "<JWT token>", confirmationCode: "123456" }
 *
 * Workflow:
 *  - Verify the JWT token and retrieve the stored data (newEmail, confirmationCode, userId)
 *  - Compare the provided confirmation code with the code stored in the token
 *  - If valid and not expired, update the user's email in MongoDB
 */
router.put('/confirm-email', authenticateAccessToken, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const {emailToken, confirmationCode} = req.body;

    if (!emailToken || !confirmationCode) {
      return res
        .status(400)
        .json({error: 'Email token and confirmation code are required.'});
    }

    let payload;
    try {
      payload = jwt.verify(emailToken, emailConfirmationSecret);
    } catch (err) {
      return res.status(400).json({error: 'Invalid or expired email token.'});
    }

    // Ensure that the token's userId matches the authenticated user
    if (payload.userId.toString() !== currentUserId.toString()) {
      return res.status(400).json({error: 'Invalid token for this user.'});
    }

    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({error: 'Invalid confirmation code.'});
    }

    // console.log('Payload userId:', payload.userId.toString());
    // console.log('Current userId:', currentUserId.toString());

    // Update the user's email in MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      currentUserId,
      {email: payload.newEmail},
      {new: true},
    );

    return res.json({
      message: 'Email updated successfully.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error in /confirm-email:', error);
    return res.status(500).json({error: 'Internal server error.'});
  }
});

// 5. Editing the user's credit point
router.post('/credit-editor', authenticateAccessToken, async (req, res) => {
  try {
    // Extract keyword from the request body
    const {keyword} = req.body;
    if (!keyword) {
      return res.status(400).json({error: 'Keyword is required.'});
    }

    // Check if the keyword exists in our creditActions mapping
    if (!creditActions.hasOwnProperty(keyword)) {
      return res.status(400).json({error: 'Invalid keyword provided.'});
    }

    // Determine the credit change based on the provided keyword
    const creditChange = creditActions[keyword];

    // req.user is attached by the authenticateAccessToken middleware
    const user = req.user;

    // Update the user's credit
    user.credit += creditChange;
    await user.save();

    // Return a success response with the updated credit
    res.status(200).json({
      message: 'User credit updated successfully.',
      credit: user.credit,
    });
  } catch (error) {
    console.error('Error updating credit:', error);
    res.status(500).json({error: 'Internal server error.'});
  }
});

// 6.1. Forgot password APIs, first ask for email and send code
router.put('/forgot-password', async (req, res) => {
  try {
    const {email, newPassword} = req.body;

    if (!email || !newPassword) {
      return res
        .status(400)
        .json({error: 'Email and new password are required.'});
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({error: 'Invalid email format.'});
    }

    // Basic password validation
    if (!isValidPassword(newPassword)) {
      return res
        .status(400)
        .json({
          error:
            'Password must be at least 8 characters long and contain both letters and numbers.',
        });
    }

    // Check if a user exists with this email
    const user = await User.findOne({email});
    if (!user) {
      return res.status(404).json({error: 'User not found with that email.'});
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res
        .status(400)
        .json({
          error: 'New password cannot be the same as the current password.',
        });
    }
    // Hash the new password before updating
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Generate a confirmation code
    const confirmationCode = generateConfirmationCode();

    // Create a JWT token containing the email and confirmation code with a 5-minute expiry
    const emailToken = jwt.sign(
      {email, confirmationCode, newPassword: hashedPassword},
      passwordResetSecret,
      {expiresIn: '5m'},
    );

    // Send the confirmation code to the provided email address
    await sendConfirmationEmail(email, confirmationCode);

    return res.json({
      message: 'Confirmation code sent successfully.',
      emailToken,
    });
  } catch (error) {
    console.error('Error in /forgot-password:', error);
    return res.status(500).json({error: 'Internal server error.'});
  }
});

// 6.2. Check the code and return the email for /edit-user API
router.put('/confirm-forgot-password', async (req, res) => {
  try {
    const {emailToken, confirmationCode} = req.body;

    if (!emailToken || !confirmationCode) {
      return res
        .status(400)
        .json({error: 'Email token and confirmation code are required.'});
    }

    let payload;
    try {
      payload = jwt.verify(emailToken, passwordResetSecret);
    } catch (err) {
      return res.status(400).json({error: 'Invalid or expired email token.'});
    }

    // Check if the confirmation code provided by the user matches the one stored in the token
    if (payload.confirmationCode !== confirmationCode) {
      return res.status(400).json({error: 'Invalid confirmation code.'});
    }

    // Update the user's password in the database
    const updatedUser = await User.findOneAndUpdate(
      {email: payload.email},
      {password: payload.newPassword},
      {new: true},
    );

    if (!updatedUser) {
      return res.status(404).json({error: 'User not found.'});
    }

    // Success - respond with the email from the token
    return res.json({
      message: 'Password updated successfully.',
      email: payload.email,
    });
  } catch (error) {
    console.error('Error in /confirm-forgot-password:', error);
    return res.status(500).json({error: 'Internal server error.'});
  }
});

// 7. Confirm KYC
router.post('/confirm-kyc', authenticateAccessToken, async (req, res) => {
  const userId = req.user._id;
  await User.findByIdAndUpdate(userId, {isKYC: true});
  res.send({success: true});
});

// 8. Đăng ký làm tình nguyện viên cho một chiến dịch
router.post(
  '/volunteer/:campaignId',
  authenticateAccessToken,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId);

      const requiredFields = ['fullName', 'dateOfBirth', 'phoneNum', 'address'];
      const missing = requiredFields .filter(f => {
        const v = user[f];
        return !v || (typeof v === 'string' && v.trim()==='');
      });
      if (missing.length) {
        return res.json({
          isSuccess: false,
          message: 'Missing required fields',
          missingFields: missing
        });
      }

      const { campaignId } = req.params;
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          isSuccess: false,
          message: 'Campaign not found'
        });
      }

      if (!campaign.volunteers.includes(userId)) {
        campaign.volunteers.push(userId);
        await campaign.save();
      }
      if (!user.joinedCampaigns.includes(campaignId)) {
        user.joinedCampaigns.push(campaignId);
        await user.save();
      }

      return res.json({
        isSuccess: true,
        message: 'Registered as volunteer successfully',
        campaignId,
        userId
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

module.exports = router;
