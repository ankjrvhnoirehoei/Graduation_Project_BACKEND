const mongoose = require('mongoose');
const { Schema } = mongoose;

const Admin = new Schema({
  id: {type: Schema.ObjectId},
  adminID: {
    type: String,
    required: true,
    unique: true, // Ensures adminID is unique
  },
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
  avatarImg: {
    type: String,
    default: '', // Frontend handles this
  },
  address: {
    type: String,
  },
});

module.exports = mongoose.model('Admin', Admin);
