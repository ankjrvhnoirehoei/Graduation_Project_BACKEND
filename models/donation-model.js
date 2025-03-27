const mongoose = require('mongoose');
const { Schema } = mongoose;

const Donation = new Schema({
  id: {type: Schema.ObjectId},
  userID: {
    type: String,
    required: true,
  },
  campID: {
    type: String,
    required: true,
    ref: 'Campaign'
  },
  paymentMethod: {
    type: String,
    // e.g., "credit_card", "paypal", "bank_transfer", etc.
  },
  status: {
    type: String,
    default: 'pending', // or "completed", "failed", etc.
  },
  donationMessage: {
    type: String, // TEXT in SQL can map to String in Mongoose
  },
  paymentCode: {
    type: String,
    // e.g., a transaction or confirmation code from payment gateway
  },
  creditCardInfo: {
    type: String,
    // For real applications, do NOT store raw credit card info in plain text.
    // Instead, store tokens or partial info that meets PCI compliance.
  },
  sponsorAmount: {
    type: Number,
    required: true,
  },
  sponsorDate: {
    type: Date,
    default: Date.now, // Defaults to current date/time
  },
});

// Create and export the model
module.exports = mongoose.model('Donation', Donation);
