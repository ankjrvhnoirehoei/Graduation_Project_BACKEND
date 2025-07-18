// Remove redis import
const mCampaign = require('../models/campaign-model');
const CatchAsync = require('../utils/CatchAsync');
const AppError = require('../utils/AppError');
const cloudinary = require('cloudinary').v2;
const Campaign = require('../models/campaign-model');
const Visual = require('../models/visual-model');
const streamifier = require('streamifier');

require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CAMPAIGNS,
  api_key: process.env.CLOUDINARY_CAMPAIGNS_API_KEY,
  api_secret: process.env.CLOUDINARY_CAMPAIGNS_API_SECRET,
});

const CampaignController = {
  getAll: CatchAsync(async (req, res, next) => {
    const shouldPopulateMedia = req.query.populate === 'media';
    
    if (shouldPopulateMedia) {
      campaigns = await mCampaign.find()
        .populate({
          path: 'media',
          select: 'link mediaType'
        })
        .lean();
      
      // Format media array
      campaigns = campaigns.map(campaign => ({
        ...campaign,
        media: campaign.media ? campaign.media.map(mediaItem => ({
          url: mediaItem.link,
          type: mediaItem.mediaType
        })) : []
      }));
    } else {
      campaigns = await mCampaign.find();
    }
    
    return res.status(200).json({ message: 'successful', campaigns });
  }),

  getById: CatchAsync(async (req, res, next) => {
    const { id } = req.params;


    const campaign = await Campaign.findById(id)
      .populate({
        path: 'media',
        select: 'link mediaType'
      })
      .lean();

    if (!campaign) {
      return next(new AppError(`We don't have any campaigns with id: ${id}`, 404));
    }

    // Format media array
    if (campaign.media && campaign.media.length > 0) {
      campaign.media = campaign.media.map(mediaItem => ({
        url: mediaItem.link,
        type: mediaItem.mediaType
      }));
    }

    return res.status(200).json({
      status: 'success',
      data: {
        campaign: {
          ...campaign,
          media: campaign.media || []
        }
      }
    });
  }),

  createCampaign: CatchAsync(async (req, res, next) => {
    // 1. Validate input data
    const requiredFields = ['hostID', 'hostType', 'totalGoal', 'campTypeID', 'campName', 'campDescription'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return next(new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400));
    }

    if (!['user', 'admin'].includes(req.body.hostType)) {
      return next(new AppError('HostType must be either "user" or "admin"', 400));
    }

    // 2. Create campaign
    const campaign = await Campaign.create({
      hostID: req.body.hostID,
      hostType: req.body.hostType,
      totalGoal: req.body.totalGoal,
      dateEnd: req.body.dateEnd || null,
      currentFund: req.body.currentFund || 0,
      campTypeID: req.body.campTypeID,
      campName: req.body.campName,
      campDescription: req.body.campDescription
    });

    // 3. Process media uploads if any
    if (req.files && req.files.length > 0) {
      try {
        const mediaUploadPromises = req.files.map(async (file) => {
          const isVideo = file.mimetype.startsWith('video/');

          // Upload to Cloudinary using stream
          const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                resource_type: isVideo ? 'video' : 'image',
                transformation: [
                  { width: 1920, crop: 'limit' },
                  { quality: 'auto' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );

            streamifier.createReadStream(file.buffer).pipe(uploadStream);
          });

          // Create visual record
          const visual = await Visual.create({
            visualID: uploadResult.public_id,
            link: uploadResult.secure_url,
            mediaType: isVideo ? 'video' : 'image',
            usedBy: campaign._id,
            usage: 'campaign'
          });

          // Add visual reference to campaign
          campaign.media.push(visual._id);
          return visual;
        });

        await Promise.all(mediaUploadPromises);
        await campaign.save(); // Save campaign with media references
      } catch (uploadError) {
        // Cleanup: Delete campaign if media upload fails
        await Campaign.findByIdAndDelete(campaign._id);
        console.error('Media upload error:', uploadError);
        return next(new AppError(`Failed to upload media: ${uploadError.message}`, 500));
      }
    }

    // 3. Clear relevant caches
    await Promise.all([
      redis.delAsync('campaigns:all'),
      redis.delAsync(`campaign:${campaign._id}`)
    ]);

    // 4. Send response with populated media
    // Remove cache clearing
    const populatedCampaign = await Campaign.findById(campaign._id).populate('media');

    res.status(201).json({
      status: 'success',
      data: {
        campaign: populatedCampaign
      }
    });
  }),

  updateCampaign: CatchAsync(async (req, res, next) => {

  })
}

module.exports = CampaignController;