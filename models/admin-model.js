const mongoose = require('mongoose');
const { Schema } = mongoose;

const Admin = new Schema({
  id: {type: Schema.ObjectId},
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
}, {timestamps: true,});

module.exports = mongoose.model('Admin', Admin);
