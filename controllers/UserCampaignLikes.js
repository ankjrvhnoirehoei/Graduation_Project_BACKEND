const UserCampaignLike = require('../models/userCampaignLikes-models');
const CatchAsync = require('../utils/CatchAsync');
const AppError = require('../utils/AppError');

const UserCampaignLikesController = {
  // Lấy tất cả campaigns mà user đã like
  getUserLikedCampaigns: CatchAsync(async (req, res, next) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!userId) {
      return next(new AppError('User ID is required', 400));
    }

    const skip = (page - 1) * limit;

    const [likedCampaigns, total] = await Promise.all([
      UserCampaignLike.find({
        userId,
        removeAt: null
      })
        .populate({
          path: 'campaignId',
          select: 'campName campDescription totalGoal currentFund media dateEnd',
          populate: {
            path: 'media',
            select: 'link mediaType'
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      UserCampaignLike.countDocuments({ userId, removeAt: null })
    ]);

    // Import Donation model để đếm số lượng donators
    const Donation = require('../models/donation-model');

    // Lấy thông tin donators cho từng campaign
    const campaignIds = likedCampaigns.map(like => like.campaignId._id);
    const donatorCounts = await Donation.aggregate([
      {
        $match: {
          campaignId: { $in: campaignIds },
          status: 'SUCCESSFUL'
        }
      },
      {
        $group: {
          _id: '$campaignId',
          donators: { $addToSet: '$donorId' }
        }
      },
      {
        $project: {
          _id: 1,
          donators: { $size: '$donators' }
        }
      }
    ]);

    const donatorMap = {};
    donatorCounts.forEach(item => {
      donatorMap[item._id.toString()] = item.donators;
    });

    // Helper function để tính số ngày còn lại
    const calculateDaysLeft = (dateEnd) => {
      if (!dateEnd) return 'Không giới hạn';

      const today = new Date();
      const endDate = new Date(dateEnd);
      const diffTime = endDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return 'Đã kết thúc';
      if (diffDays === 0) return 'Hôm nay';
      if (diffDays === 1) return '1 ngày';
      return `${diffDays} ngày`;
    };

    // Format data theo interface yêu cầu
    const formattedCampaigns = likedCampaigns.map(like => {
      const campaign = like.campaignId;
      const campaignId = campaign._id.toString();

      // Extract images từ media
      const images = campaign.media
        ? campaign.media
          .filter(media => media.mediaType === 'image')
          .map(media => media.link)
        : [];

      return {
        id: campaignId,
        name: campaign.campName || '',
        images: images,
        priceCurrent: campaign.currentFund || 0,
        pricegoal: campaign.totalGoal || 0,
        donators: donatorMap[campaignId] || 0,
        totalGoal: campaign.totalGoal || 0,
        dayLeft: calculateDaysLeft(campaign.dateEnd)
      };
    });

    res.status(200).json({
      message: 'success',
      results: formattedCampaigns.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      data: formattedCampaigns
    });
  }),

  // Thêm campaign vào danh sách yêu thích
  addFavoriteCampaign: CatchAsync(async (req, res, next) => {
    const { userId, campaignId } = req.body;

    if (!userId || !campaignId) {
      return next(new AppError('User ID and Campaign ID are required', 400));
    }

    const existingLike = await UserCampaignLike.findOne({
      userId,
      campaignId
    });

    if (existingLike) {
      if (existingLike.removeAt) {
        existingLike.removeAt = null;
        existingLike.createdAt = new Date();
        await existingLike.save();

        const populatedLike = await UserCampaignLike.findById(existingLike._id)
          .populate('campaignId', 'campName campDescription totalGoal currentFund');

        return res.status(200).json({
          message: 'Campaign restored to favorites',
          data: {
            like: {
              id: populatedLike._id,
              campaign: populatedLike.campaignId,
              likedAt: populatedLike.createdAt
            }
          }
        });
      } else {
        return res.status(200).json({
          message: 'Campaign added to favorites',
          data: {
            like: {
              id: existingLike._id,
              campaign: existingLike.campaignId,
              likedAt: existingLike.createdAt
            }
          }
        });
      }
    }

    // Tạo like mới
    const newLike = await UserCampaignLike.create({
      userId,
      campaignId
    });

    const populatedLike = await UserCampaignLike.findById(newLike._id)
      .populate('campaignId', 'campName campDescription totalGoal currentFund');

    res.status(201).json({
      message: 'Campaign added to favorites',
      data: {
        like: {
          id: populatedLike._id,
          campaign: populatedLike.campaignId,
          likedAt: populatedLike.createdAt
        }
      }
    });
  }),

    // Xóa campaign khỏi danh sách yêu thích
    removeFavoriteCampaign: CatchAsync(async (req, res, next) => {
      const { userId, campaignId } = req.body;

      if (!userId || !campaignId) {
        return next(new AppError('User ID and Campaign ID are required', 400));
      }

      const like = await UserCampaignLike.findOne({
        userId,
        campaignId,
        removeAt: null
      });

      if (!like) {
        return next(new AppError('Campaign not found in favorites', 404));
      }

      like.removeAt = new Date();
      await like.save();

      res.status(200).json({
        message: 'Campaign removed from favorites',
        data: {
          removedAt: like.removeAt
        }
      });
    }),

};

module.exports = UserCampaignLikesController;