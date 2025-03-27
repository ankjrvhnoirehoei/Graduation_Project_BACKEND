const mCampaign = require('../models/campaign-model');
const CatchAsync = require('../utils/CatchAsync');
const AppError = require('../utils/AppError');
const cloudinary = require('cloudinary').v2;
const mVisual = require('../models/visual-model');

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

    const campaign = await mCampaign.findById({ id });
    if (!campaign) {
      return next(new AppError(`We don't have any campaigns with id: ${id} `, 404));
    }

    return res.status(200).json({ message: 'successful', campaigns: campaign });
  }),

  createCampaign: CatchAsync(async (req, res, next) => {
    // 1. Validate input data
    const requiredFields = ['hostID', 'hostType', 'totalGoal', 'campTypeID', 'campName', 'campDescription'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return next(new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400));
    }

    // Validate hostType enum
    if (!['user', 'admin'].includes(req.body.hostType)) {
      return next(new AppError('Invalid hostType. Must be either "user" or "admin"', 400));
    }

    // 2. Process media uploads if any
    let media = [];
    if (req.files && req.files.length > 0) {
      try {
        media = await Promise.all(req.files.map(async (file) => {
          const isVideo = file.mimetype.startsWith('video/');

          // Upload to Cloudinary
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                resource_type: isVideo ? 'video' : 'image',
                folder: `campaigns/${req.body.hostID}`,
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

            // Sử dụng file.buffer thay vì file.path để tránh lỗi khi deploy
            stream.end(file.buffer);
          });

          // Create visual record với đầy đủ thông tin
          return await mVisual.create({
            visualID: result.public_id,
            link: result.secure_url,
            usage: 'campaign',            
          });
        }));
      } catch (uploadError) {
        // Cleanup uploaded files if error occurs
        await Promise.all(media.map(m =>
          cloudinary.uploader.destroy(m.visualID, {
            resource_type: m.mediaType === 'video' ? 'video' : 'image'
          })
        ));
        return next(new AppError('Media upload failed: ' + uploadError.message, 500));
      }
    }

    // 3. Create campaign
    try {
      const campaignData = {
        hostID: req.body.hostID,
        hostType: req.body.hostType,
        totalGoal: req.body.totalGoal,
        dateEnd: req.body.dateEnd || null,
        currentFund: req.body.currentFund || 0,
        campTypeID: req.body.campTypeID,
        campName: req.body.campName,
        campDescription: req.body.campDescription,
      };

      const campaign = await mCampaign.create(campaignData);

      // 4. Send response
      res.status(201).json({
        status: 'success',
        data: {
          campaign: await mCampaign.findById(campaign._id)
            .populate({
              path: 'media',
              select: 'visualID link mediaType format'
            })
        }
      });

    } catch (dbError) {
      // Cleanup if database error occurs
      await Promise.all([
        ...media.map(m =>
          cloudinary.uploader.destroy(m.visualID, {
            resource_type: m.mediaType === 'video' ? 'video' : 'image'
          })
        ),
        ...media.map(m => mVisual.findByIdAndDelete(m._id))
      ]);

      return next(new AppError('Failed to create campaign: ' + dbError.message, 500));
    }
  }),


}

module.exports = CampaignController;