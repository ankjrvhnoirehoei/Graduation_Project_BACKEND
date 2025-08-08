const express = require('express');
const router = express.Router();
const UserCampaignLikesController = require('../controllers/UserCampaignLikes');

/**
 * @route   GET /api/user-campaign-likes/user/:userId
 * @desc    Get all campaigns liked by a user
 * @access  Public
 * @params  userId - User ID
 * @query   page, limit - Pagination parameters
 */
router.get('/user/:userId', UserCampaignLikesController.getUserLikedCampaigns);

/**
 * @route   POST /api/user-campaign-likes/add
 * @desc    Add a campaign to user's favorites
 * @access  Public
 * @body    { userId, campaignId }
 */
router.post('/add', UserCampaignLikesController.addFavoriteCampaign);

/**
 * @route   POST /api/user-campaign-likes/remove
 * @desc    Remove a campaign from user's favorites (soft delete)
 * @access  Public
 * @body    { userId, campaignId }
 */
router.post('/remove', UserCampaignLikesController.removeFavoriteCampaign);


module.exports = router;