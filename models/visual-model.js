const mongoose = require('mongoose');
const { Schema } = mongoose;

const Visual = new Schema({
  visualID: {
    type: String,
    required: true,
    unique: true,
  },
  link: {
    type: String,
    required: true,
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  usedBy: {
    type: Schema.Types.ObjectId,
    refPath: 'usage'
  },
  usage: {
    type: String,
    enum: ['user', 'admin', 'campaign'],
    required: true
  },
}, {
  versionKey: false
});

module.exports = mongoose.model('Visual', Visual);