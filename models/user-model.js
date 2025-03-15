// models/User.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the schema
const User = new Schema({
  id: {type: Schema.ObjectId},
  userID: {
    type: String,
    required: true,
    unique: true, 
  },
  fullName: {
    type: String,
    required: true,
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
    required: true,
    unique: true, 
  },
  password: {
    type: String,
    required: true,
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
}, {timestamps: true,});

module.exports = mongoose.model('User', User);
