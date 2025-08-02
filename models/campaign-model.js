const mongoose = require('mongoose');
const User = require('./user-model');
const { Schema } = mongoose;

const Campaign = new Schema({
  hostID: {
    type: String,
    required: true,
  },
  hostType: {
    type: String,
    enum: ['user', 'admin'],
    required: true
  },
  dateCreated: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['preparing', 'active', 'ended'],
    default: 'preparing', 
  },
  totalGoal: {
    type: Number,
    required: true,
  },
  dateEnd: {
    type: Date,
  },
  currentFund: {
    type: Number,
    default: 0, 
  },
  campTypeID: {
    type: String,
    required: true,
  },
  campName: {
    type: String,
    required: true,
  },
  campDescription: {
    type: String,
    required: true,
  },
  // Thêm trường media references
  media: [{
    type: Schema.Types.ObjectId,
    ref: 'Visual'
  }],
  volunteers: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
}, {
  versionKey: false
});

module.exports = mongoose.model('Campaign', Campaign);