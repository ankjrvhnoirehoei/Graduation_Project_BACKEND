const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserCampaignLikeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    removeAt: {
      type: Date,
      default: null
    }
  },
  {
    versionKey: false,
  }
);

UserCampaignLikeSchema.index({ userId: 1, campaignId: 1 }, { unique: true });

module.exports = mongoose.model('UserCampaignLike', UserCampaignLikeSchema);