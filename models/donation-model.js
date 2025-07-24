const mongoose = require('mongoose');
const User = require('./user-model');
const Campaign = require('./campaign-model');
const { Schema } = mongoose;

const DonationSchema = new Schema({
  // --- Thông tin tham chiếu ---
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: Campaign.name,
    required: true,
    index: true
  },

  amount: {
    type: Number,
    required: true,
    min: 1000
  },
  currency: {
    type: String,
    required: true,
    default: 'VND'
  },
  message: {
    type: String,
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['ZALOPAY', 'STRIPE',],
    required: true
  },
  transactionCode: {
    type: String,
    unique: true,
    sparse: true // Cho phép nhiều document có giá trị null, nhưng nếu có giá trị thì phải là duy nhất
  },

  status: {
    type: String,
    enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'],
    default: 'REFUNDED',
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

DonationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

DonationSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

DonationSchema.index({ donorId: 1, campaignId: 1 });
DonationSchema.index({ status: 1, createdAt: -1 });
DonationSchema.index({ paymentMethod: 1, status: 1 });

module.exports = mongoose.model('Donation', DonationSchema);
