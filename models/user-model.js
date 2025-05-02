const mongoose = require('mongoose');
const { Schema } = mongoose;

const User = new Schema({
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
    default: '',
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
  lockedAccount: {
    type: Boolean,
    defaul: false,
  }
}, {timestamps: true,});

module.exports = mongoose.model('User', User);
