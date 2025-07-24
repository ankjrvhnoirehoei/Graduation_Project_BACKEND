const mongoose = require('mongoose');
const Donation = require('../models/donation-model');
const Campaign = require('../models/campaign-model');
const User = require('../models/user-model');
const CatchAsync = require('../utils/CatchAsync');
const AppError = require('../utils/AppError');

const DonationController = {
  createDonation: CatchAsync(async (req, res, next) => {
    const {
      donorId,
      campaignId,
      amount,
      currency = 'VND',
      message,
      paymentMethod,
      transactionCode,
      isAnonymous = false
    } = req.body;

    if (!donorId || !campaignId || !amount || !paymentMethod) {
      return next(new AppError('Missing required fields: donorId, campaignId, amount, paymentMethod', 400));
    }

    if (amount <= 0) {
      return next(new AppError('Amount must be greater than 0', 400));
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return next(new AppError('Campaign not found', 404));
    }

    const user = await User.findById(donorId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const donation = await Donation.create({
      donorId,
      campaignId,
      amount,
      currency,
      message,
      paymentMethod,
      transactionCode,
      isAnonymous,
      status: 'PENDING'
    });

    await donation.populate([
      { path: 'donorId', select: 'name email' },
      { path: 'campaignId', select: 'campName totalGoal currentFund' }
    ]);

    res.status(201).json({
      status: 'success',
      data: {
        donation
      }
    });
  }),

  getAllDonations: CatchAsync(async (req, res, next) => {
    const {
      page = 1,
      limit = 10,
      status,
      paymentMethod,
      campaignId,
      donorId,
      isAnonymous,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (campaignId) filter.campaignId = campaignId;
    if (donorId) filter.donorId = donorId;
    if (isAnonymous !== undefined) filter.isAnonymous = isAnonymous === 'true';

    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .populate('donorId', 'name email')
        .populate('campaignId', 'campName totalGoal currentFund')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Donation.countDocuments(filter)
    ]);

    res.status(200).json({
      status: 'success',
      results: donations.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      data: {
        donations
      }
    });
  }),

  getDonationById: CatchAsync(async (req, res, next) => {
    const { id } = req.params;

    const donation = await Donation.findById(id)
      .populate('donorId', 'name email phone')
      .populate('campaignId', 'campName campDescription totalGoal currentFund hostID');

    if (!donation) {
      return next(new AppError('Donation not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        donation
      }
    });
  }),

  updateDonationStatus: CatchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, transactionCode } = req.body;

    if (!status) {
      return next(new AppError('Status is required', 400));
    }

    const validStatuses = ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 400));
    }

    const updateData = { status };
    if (transactionCode) {
      updateData.transactionCode = transactionCode;
    }

    const donation = await Donation.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'donorId', select: 'name email' },
      { path: 'campaignId', select: 'campName totalGoal currentFund' }
    ]);

    if (!donation) {
      return next(new AppError('Donation not found', 404));
    }

    if (status === 'SUCCESSFUL') {
      await Campaign.findByIdAndUpdate(
        donation.campaignId._id,
        { $inc: { currentFund: donation.amount } }
      );
    }

    res.status(200).json({
      status: 'success',
      data: {
        donation
      }
    });
  }),

  getDonationsByCampaign: CatchAsync(async (req, res, next) => {
    const { campaignId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = 'SUCCESSFUL',
      includeAnonymous = true
    } = req.query;

    const filter = { campaignId };
    if (status) filter.status = status;
    if (includeAnonymous === 'false') filter.isAnonymous = false;

    const skip = (page - 1) * limit;

    const [donations, total, totalAmount] = await Promise.all([
      Donation.find(filter)
        .populate('donorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Donation.countDocuments(filter),
      Donation.aggregate([
        { $match: { campaignId: mongoose.Types.ObjectId(campaignId), status: 'SUCCESSFUL' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.status(200).json({
      status: 'success',
      results: donations.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      summary: {
        totalAmount: totalAmount[0]?.total || 0
      },
      data: {
        donations
      }
    });
  }),

  getDonationsByUser: CatchAsync(async (req, res, next) => {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 10,
      status
    } = req.query;

    const filter = { donorId: userId };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .populate('campaignId', 'campName campDescription totalGoal currentFund')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Donation.countDocuments(filter)
    ]);

    res.status(200).json({
      status: 'success',
      results: donations.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      data: {
        donations
      }
    });
  }),

  getDonationStats: CatchAsync(async (req, res, next) => {
    const { campaignId, startDate, endDate } = req.query;

    const matchStage = {};
    if (campaignId) matchStage.campaignId = mongoose.Types.ObjectId(campaignId);
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const stats = await Donation.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    const paymentMethodStats = await Donation.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        statusStats: stats,
        paymentMethodStats
      }
    });
  }),

  deleteDonation: CatchAsync(async (req, res, next) => {
    const { id } = req.params;

    const donation = await Donation.findById(id);
    if (!donation) {
      return next(new AppError('Donation not found', 404));
    }

    if (!['PENDING', 'FAILED'].includes(donation.status)) {
      return next(new AppError('Cannot delete successful or refunded donations', 400));
    }

    await Donation.findByIdAndDelete(id);

    res.status(204).json({
      status: 'success',
      data: null
    });
  })
};

module.exports = DonationController;