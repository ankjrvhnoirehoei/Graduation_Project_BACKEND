const axios = require("axios");
const express = require("express");
const moment = require("moment");
const router = express.Router();
const CryptoJS = require('crypto-js');
const DonationController = require('../controllers/DonationController');
const Donation = require('../models/donation-model');
const Campaign = require('../models/campaign-model');

// ZaloPay Configuration - Use environment variables in production
const config = {
  app_id: process.env.ZALOPAY_APP_ID,
  key1: process.env.ZALOPAY_KEY1,
  key2: process.env.ZALOPAY_KEY2,
  endpoint: process.env.ZALOPAY_ENDPOINT,
  query_endpoint: process.env.ZALOPAY_QUERY_ENDPOINT,
};

// Helper function to generate MAC signature
const generateMac = (data, key) => {
  return CryptoJS.HmacSHA256(data, key).toString();
};

// Helper function to validate ZaloPay response
const isValidZaloPayResponse = (response) => {
  return response && response.data && response.data.return_code !== undefined;
};

/**
 * Create ZaloPay payment order
 * POST /api/zalopay/create
 * Based on ZaloPay API v2 documentation
 */
router.post("/create", async (req, res) => {
  try {
    const {
      amount,
      description,
      donorId,
      campaignId,
      donorName,
      isAnonymous = false,
      redirectUrl
    } = req.body;

    // Input validation
    if (!amount || !donorId || !campaignId || !donorName) {
      return res.status(400).json({
        return_code: -1,
        return_message: "Thiếu thông tin bắt buộc: amount, donorId, campaignId, donorName"
      });
    }

    // Validate amount (minimum 1,000 VND for ZaloPay)
    if (amount < 1000 || amount > 5000000) {
      return res.status(400).json({
        return_code: -1,
        return_message: "Số tiền phải từ 1,000đ đến 5,000,000đ"
      });
    }

    // Verify campaign exists and is active
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        return_code: -1,
        return_message: "Không tìm thấy chiến dịch"
      });
    }

    // Generate unique transaction ID
    const transID = Math.floor(Math.random() * 1000000);
    const app_trans_id = `${moment().format("YYMMDD")}_${transID}`;

    // Create donation record with PENDING status
    const donation = await Donation.create({
      donorId,
      campaignId,
      amount,
      currency: 'VND',
      message: description || `Quyên góp cho ${campaign.campName}`,
      paymentMethod: 'ZALOPAY',
      transactionCode: app_trans_id,
      isAnonymous,
      status: 'PENDING'
    });

    // Prepare embed_data for ZaloPay
    const embed_data = {
      redirecturl: redirectUrl || "",
      merchantinfo: "Charity Donation Platform",
      donationId: donation._id.toString(),
      campaignId: campaignId
    };

    // Prepare items array
    const items = [{
      itemid: donation._id.toString(),
      itemname: `Quyên góp: ${campaign.campName}`,
      itemprice: amount,
      itemquantity: 1
    }];

    // Prepare order data according to ZaloPay API specification
    const order = {
      app_id: config.app_id,
      app_trans_id: app_trans_id,
      app_user: donorName,
      app_time: Date.now(),
      amount: amount,
      description: description || `Quyên góp cho ${campaign.campName}`,
      bank_code: "zalopayapp",
      item: JSON.stringify(items),
      embed_data: JSON.stringify(embed_data),
      callback_url: `${req.protocol}://${req.get('host')}/api/zalopay/callback`
    };

    // Generate MAC signature according to ZaloPay specification
    const macData = [
      config.app_id,
      order.app_trans_id,
      order.app_user,
      order.amount,
      order.app_time,
      order.embed_data,
      order.item
    ].join("|");

    order.mac = generateMac(macData, config.key1);

    console.log("Creating ZaloPay order:", {
      app_trans_id,
      amount,
      donationId: donation._id,
      campaignName: campaign.campName
    });

    // Call ZaloPay API
    const response = await axios.post(config.endpoint, null, {
      params: order,
      timeout: 10000 // 10 second timeout
    });

    if (!isValidZaloPayResponse(response)) {
      throw new Error("Invalid response from ZaloPay");
    }

    if (response.data.return_code === 1) {
      // Success - ZaloPay order created
      return res.status(200).json({
        return_code: 1,
        return_message: "Tạo đơn thanh toán thành công",
        order_url: response.data.order_url,
        zp_trans_token: response.data.zp_trans_token,
        order_token: response.data.order_token,
        app_trans_id: app_trans_id,
        donation_id: donation._id
      });
    } else {
      // ZaloPay order creation failed
      await Donation.findByIdAndUpdate(donation._id, {
        status: 'FAILED',
        updatedAt: new Date()
      });

      console.error("ZaloPay order creation failed:", response.data);
      return res.status(400).json({
        return_code: response.data.return_code,
        return_message: response.data.return_message || "Không thể tạo đơn thanh toán"
      });
    }

  } catch (error) {
    console.error("ZaloPay create order error:", error);

    // Handle specific error types
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        return_code: -1,
        return_message: "Timeout khi kết nối với ZaloPay"
      });
    }

    return res.status(500).json({
      return_code: -1,
      return_message: "Lỗi hệ thống khi tạo đơn thanh toán"
    });
  }
});

/**
 * ZaloPay callback handler
 * POST /api/zalopay/callback
 * Handles payment notifications from ZaloPay
 */
router.post("/callback", async (req, res) => {
  let result = {
    return_code: -1,
    return_message: "Unknown error"
  };

  try {
    const { data: dataStr, mac: reqMac } = req.body;

    // Validate callback data
    if (!dataStr || !reqMac) {
      result.return_code = -1;
      result.return_message = "Missing callback data";
      console.error("ZaloPay callback: Missing data or mac");
      return res.json(result);
    }

    console.log("ZaloPay callback received:", {
      dataLength: dataStr.length,
      macReceived: reqMac.substring(0, 10) + "..."
    });

    // Verify MAC signature using key2
    const calculatedMac = generateMac(dataStr, config.key2);

    if (reqMac !== calculatedMac) {
      result.return_code = -1;
      result.return_message = "MAC verification failed";
      console.error("ZaloPay callback: MAC verification failed", {
        received: reqMac.substring(0, 10) + "...",
        calculated: calculatedMac.substring(0, 10) + "..."
      });
      return res.json(result);
    }

    // Parse callback data
    let dataJson;
    try {
      dataJson = JSON.parse(dataStr);
    } catch (parseError) {
      result.return_code = -1;
      result.return_message = "Invalid JSON data";
      console.error("ZaloPay callback: JSON parse error", parseError);
      return res.json(result);
    }

    const { app_trans_id, amount, zp_trans_id } = dataJson;

    console.log("Processing successful payment:", {
      app_trans_id,
      amount,
      zp_trans_id
    });

    // Find and update donation
    const donation = await Donation.findOneAndUpdate(
      { transactionCode: app_trans_id },
      {
        status: 'SUCCESSFUL',
        updatedAt: new Date()
      },
      { new: true }
    ).populate('campaignId');

    if (!donation) {
      console.error("Donation not found for transaction:", app_trans_id);
      result.return_code = 0;
      result.return_message = "Donation not found";
      return res.json(result);
    }

    // Verify amount matches
    if (donation.amount !== amount) {
      console.error("Amount mismatch:", {
        donationAmount: donation.amount,
        callbackAmount: amount
      });
      result.return_code = 0;
      result.return_message = "Amount mismatch";
      return res.json(result);
    }

    // Update campaign's current fund
    await Campaign.findByIdAndUpdate(
      donation.campaignId._id,
      { $inc: { currentFund: donation.amount } }
    );

    console.log(`Donation ${donation._id} processed successfully:`, {
      donationId: donation._id,
      amount: donation.amount,
      campaignId: donation.campaignId._id,
      campaignName: donation.campaignId.campName
    });

    // TODO: Send confirmation notifications
    // await sendDonationConfirmation(donation);
    // await sendCampaignUpdate(donation.campaignId);

    result.return_code = 1;
    result.return_message = "success";

  } catch (error) {
    console.error("ZaloPay callback processing error:", error);
    result.return_code = 0;
    result.return_message = "Processing error";
  }

  // Always return JSON response for ZaloPay
  return res.json(result);
});

/**
 * Query payment status
 * POST /api/zalopay/query
 * Check payment status from ZaloPay
 */
router.post("/query", async (req, res) => {
  try {
    const { app_trans_id } = req.body;

    if (!app_trans_id) {
      return res.status(400).json({
        return_code: -1,
        return_message: "Thiếu mã giao dịch (app_trans_id)"
      });
    }

    // Prepare query data according to ZaloPay specification
    const macData = [config.app_id, app_trans_id, config.key1].join("|");
    const mac = generateMac(macData, config.key1);

    const queryData = {
      app_id: config.app_id,
      app_trans_id: app_trans_id,
      mac: mac
    };
    console.log("Querying ZaloPay status for:", app_trans_id);
    // Query both ZaloPay and local donation record
    const [zaloPayResponse, donation] = await Promise.all([
      axios.post(config.query_endpoint, null, {
        params: queryData,
        timeout: 10000
      }),
      Donation.findOne({ transactionCode: app_trans_id })
        .populate('donorId', 'name email')
        .populate('campaignId', 'campName campDescription totalGoal currentFund')
    ]);

    if (!isValidZaloPayResponse(zaloPayResponse)) {
      throw new Error("Invalid response from ZaloPay query API");
    }

    // Prepare response
    const response = {
      return_code: zaloPayResponse.data.return_code,
      return_message: zaloPayResponse.data.return_message,
      zp_trans_id: zaloPayResponse.data.zp_trans_id,
      amount: zaloPayResponse.data.amount,
      discount_amount: zaloPayResponse.data.discount_amount || 0
    };

    // Add donation information if found
    if (donation) {
      response.donation = {
        id: donation._id,
        status: donation.status,
        amount: donation.amount,
        message: donation.message,
        isAnonymous: donation.isAnonymous,
        createdAt: donation.createdAt,
        donor: donation.isAnonymous ? null : donation.donorId,
        campaign: {
          id: donation.campaignId._id,
          name: donation.campaignId.campName,
          description: donation.campaignId.campDescription,
          totalGoal: donation.campaignId.totalGoal,
          currentFund: donation.campaignId.currentFund
        }
      };
    }

    return res.json(response);

  } catch (error) {
    console.error("Query payment status error:", error);

    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        return_code: -1,
        return_message: "Timeout khi truy vấn ZaloPay"
      });
    }

    return res.status(500).json({
      return_code: -1,
      return_message: "Lỗi hệ thống khi truy vấn trạng thái thanh toán"
    });
  }
});



// ===== DONATION MANAGEMENT ROUTES =====

/**
 * Get donation by transaction code
 * GET /api/zalopay/donation/:transactionCode
 */
router.get("/donation/:transactionCode", async (req, res) => {
  try {
    const { transactionCode } = req.params;

    const donation = await Donation.findOne({ transactionCode })
      .populate('donorId', 'name email phone')
      .populate('campaignId', 'campName campDescription totalGoal currentFund');

    if (!donation) {
      return res.status(404).json({
        return_code: -1,
        return_message: "Không tìm thấy giao dịch quyên góp"
      });
    }

    return res.json({
      return_code: 1,
      return_message: "success",
      data: {
        donation: {
          id: donation._id,
          transactionCode: donation.transactionCode,
          amount: donation.amount,
          currency: donation.currency,
          message: donation.message,
          status: donation.status,
          isAnonymous: donation.isAnonymous,
          createdAt: donation.createdAt,
          updatedAt: donation.updatedAt,
          donor: donation.isAnonymous ? null : donation.donorId,
          campaign: donation.campaignId
        }
      }
    });

  } catch (error) {
    console.error("Get donation error:", error);
    return res.status(500).json({
      return_code: -1,
      return_message: "Lỗi hệ thống"
    });
  }
});

/**
 * Get donations by campaign
 * GET /api/zalopay/donations/campaign/:campaignId
 */
router.get("/donations/campaign/:campaignId", DonationController.getDonationsByCampaign);

/**
 * Get donations by user
 * GET /api/zalopay/donations/user/:userId
 */
router.get("/donations/user/:userId", DonationController.getDonationsByUser);

/**
 * Get donation statistics
 * GET /api/zalopay/donations/stats
 */
router.get("/donations/stats", DonationController.getDonationStats);

/**
 * Update donation status manually (Admin only)
 * PATCH /api/zalopay/donation/:id/status
 */
router.patch("/donation/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        return_code: -1,
        return_message: "Thiếu trạng thái cần cập nhật"
      });
    }

    const validStatuses = ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        return_code: -1,
        return_message: "Trạng thái không hợp lệ. Chỉ chấp nhận: " + validStatuses.join(', ')
      });
    }

    const donation = await Donation.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate([
      { path: 'donorId', select: 'name email' },
      { path: 'campaignId', select: 'campName totalGoal currentFund' }
    ]);

    if (!donation) {
      return res.status(404).json({
        return_code: -1,
        return_message: "Không tìm thấy giao dịch quyên góp"
      });
    }

    // Update campaign fund if status changed to SUCCESSFUL
    if (status === 'SUCCESSFUL') {
      await Campaign.findByIdAndUpdate(
        donation.campaignId._id,
        { $inc: { currentFund: donation.amount } }
      );
    }

    console.log(`Donation ${id} status updated to ${status} by admin`);

    return res.json({
      return_code: 1,
      return_message: "Cập nhật trạng thái thành công",
      data: { donation }
    });

  } catch (error) {
    console.error("Update donation status error:", error);
    return res.status(500).json({
      return_code: -1,
      return_message: "Lỗi hệ thống khi cập nhật trạng thái"
    });
  }
});

module.exports = router;
