const mCampaign = require('../models/campaign-model');
const CatchAsync = require('../utils/CatchAsync');
const AppError = require('../utils/AppError');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const Campaign = require('../models/campaign-model');
const Visual = require('../models/visual-model');
const streamifier = require('streamifier');
const {cloudinaryConfig} = require('../config');

// Cấu hình Cloudinary (nên đặt trong file config)
cloudinary.config(cloudinaryConfig);

const CampaignController = {
  getAll: CatchAsync(async (req, res, next) => {
    const campaigns = await mCampaign.find();

    if (!campaigns) {
      next(new AppError("We don't have any campaigns", 404));
    }
    return res.status(200).json({ message: 'successful', campaigns: campaigns });
  }),

  getById: CatchAsync(async (req, res, next) => {
    const { id } = req.params;

    // 2. Find campaign and populate media with only necessary fields
    const campaign = await Campaign.findById(id)
      .populate({
        path: 'media',
        select: 'link mediaType' // Chỉ lấy trường link và mediaType từ Visual
      })
      .lean(); // Chuyển sang plain JavaScript object để xử lý

    if (!campaign) {
      return next(new AppError(`We don't have any campaigns with id: ${id}`, 404));
    }

    // 3. Format media array to only include links and mediaType
    if (campaign.media && campaign.media.length > 0) {
      campaign.media = campaign.media.map(mediaItem => ({
        url: mediaItem.link,
        type: mediaItem.mediaType
      }));
    }

    // 4. Send formatted response
    return res.status(200).json({ 
      status: 'success',
      data: {
        campaign: {
          ...campaign,
          media: campaign.media || [] // Đảm bảo media luôn là array
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
                folder: `campaigns/${campaign._id}`,
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
  
    // 4. Send response with populated media
    const populatedCampaign = await Campaign.findById(campaign._id).populate('media');
  
    res.status(201).json({
      status: 'success',
      data: {
        campaign: populatedCampaign
      }
    });
  })

}

module.exports = CampaignController;