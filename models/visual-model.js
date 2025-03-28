const mongoose = require('mongoose');
const { Schema } = mongoose;

const Visual = new Schema({
  id: {type: Schema.ObjectId},
  visualID: {
    type: String,
    required: true,
    unique: true, // Ensures each visualID is unique
  },
  link: {
    type: String,
    required: true,
  },
  dateCreated: {
    type: Date,
    default: Date.now, // Automatically sets to current date/time if not provided
  },
  usedBy: {
    type: Schema.ObjectId,
    refPath: 'usage'
  },
  usage: {
    type: String,
    enum: ['user', 'admin', 'campaign', 'other'],
  },
});

// Create and export the model
module.exports = mongoose.model('Visual', Visual);
