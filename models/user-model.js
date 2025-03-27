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
    default: '',
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
    unique: true, 
    default: ''
  },
  username: {
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
    default: '',
  },
  phoneNum: {
    type: String,
    default: '',
  },
  address: {
    type: String,
    default: '',
  },
  refreshToken: {
    type: String,
    default: '',
  },
}, {timestamps: true,});

module.exports = mongoose.model('User', User);
