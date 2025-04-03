const mongoose = require('mongoose');
const { Schema } = mongoose;

const Admin = new Schema({
  role: {
    type: String,
    enum: ['topadmin', 'localadmin'],
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
  address: {
    type: String,
  },
  refreshToken: {
    type: String,
    default: '',
  },
  lockedAccount: {
    type: Boolean,
    default: false,
  }
}, {timestamps: true,});

module.exports = mongoose.model('Admin', Admin);
