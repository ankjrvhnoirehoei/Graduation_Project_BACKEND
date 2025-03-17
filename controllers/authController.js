const User = require('../models/user-model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/CatchAsync');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const AuthController = {
  signUp: catchAsync(async (req, res) => {
    const { body } = req;

    const newUser = new User({ ...body });
    const token = signToken(newUser._id);
    await newUser.save();

    const userRes = { ...newUser.toObject() };
    delete userRes.password;
    delete userRes.refreshToken;
    res
      .status(201)
      .json({ message: 'Created Successful', token: token, user: userRes });
  }),

  login: catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Please provide email and password', 400));
    }
    const user = await User.findOne({ email });

    if (!user) {
      return next(new AppError('User not Found', 404));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(new AppError('Wrong Password', 401));
    }

    const token = signToken(user._id);
    const userResponse = { ...user.toObject() };
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(200).json({ message: 'Login successful', token, user: userResponse });
  }),

  protect: catchAsync(async (req, res, next) => {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET_KEY);

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(new AppError('User recently changed password! Please log in again.', 401));
    }

    req.user = currentUser;
    next();
  }),
};

module.exports = AuthController;