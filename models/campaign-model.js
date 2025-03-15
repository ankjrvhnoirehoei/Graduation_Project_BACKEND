const mongoose = require('mongoose');
const { Schema } = mongoose;

const Campaign = new Schema({
  id: {type: Schema.ObjectId},
  campID: {
    type: String,
    required: true,
    unique: true, 
  },
  hostID: { // Either userID or adminID
    type: String,
    required: true,
  },
  hostType: { // Check if the host is user or admin
    type: String,
    enum: ['user', 'admin'],
    required: true
  },
  dateCreated: {
    type: Date,
    default: Date.now, // Automatically set the creation date
  },
  status: {
    type: String,
    default: 'active', 
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
});

module.exports = mongoose.model('Campaign', Campaign);
