const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { Schema } = mongoose;

// Define the schema
const User = new Schema(
  {
    userID: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Please provide your Full Name!'],
    },
    credit: {
      type: Number,
      default: 0,
    },
    isKYC: {
      type: Boolean,
      default: false,
    },
    email: {
      type: String,
      required: [true, 'Please provide an Email!'],
      unique: true,
      index: true,
      validate: [validator.isEmail, 'Please provide a valid email!'],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password!'],
      validate: {
        validator: function (value) {
          return value.length >= 8;
        },
        message: 'Password must be at least 8 characters long',
      },
    },
    avatarImg: {
      type: String,
      default: '',
    },
    dateOfBirth: {
      type: Date,
    },
    phoneNum: {
      type: String,
    },
    address: {
      type: String,
    },
    refreshToken: {
      type: String,
    },
    passwordChangedAt: Date, // This field will track the date when the password field was modified

  },
  { timestamps: true },
);

User.pre('save', function (next) {
  // Hashing password when created or modified.
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(this.password, salt);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

User.methods.comparePassword = function (candidatePassword) {
  try {
    return bcrypt.compareSync(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Error comparing passwords');
  }
};

User.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

module.exports = mongoose.models.User || mongoose.model('User', User);