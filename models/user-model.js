const mongoose = require('mongoose');
const {Schema} = mongoose;

const User = new Schema(
  {
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
      required: function() {
        return this.loginMethod === 'traditional' && !this.googleId;
      },
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: function() {
        return this.loginMethod === 'traditional' && !this.googleId;
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    loginMethod: {
      type: String,
      enum: ['traditional', 'google'],
      default: 'traditional',
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
      default: false,
    },
    joinedCampaigns: [{
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: []
    }],
  },
  {timestamps: true},
);

module.exports = mongoose.model('User', User);
