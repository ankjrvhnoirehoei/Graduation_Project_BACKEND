const { default: axios } = require("axios");
const express = require("express");
const moment = require("moment");
const router = express.Router();
const CryptoJS = require('crypto-js');
const DonationController = require('../controllers/DonationController');
const Donation = require('../models/donation-model');
const Campaign = require('../models/campaign-model');

const config = {
  app_id: "2554",
  key1: "sdngKKJmqEMzvh5QQcdD2A9XBSKUNaYn",
  key2: "trMrHtvjo6myautxDUiAcYsVtaeQ8nhf",
  endpoint: "https://sb-openapi.zalopay.vn/v2/create",
  query_endpoint: "https://sb-openapi.zalopay.vn/v2/query",
  refund_endpoint: "https://sb-openapi.zalopay.vn/v2/refund"
};

// Create ZaloPay order with donation record
router.post("/zalopay", async (req, res) => {
  try {
    const {
      sponsorAmount,
      urlCalbackSuccess,
      hostID,
      campName,
      donationMessage,
      fullName,
      donorId,
      campaignId,
      isAnonymous = false
    } = req.body;

    if (!sponsorAmount || !fullName) {
      return res.status(400).json({
        message: 'fail',
        data: false,
        error: "Vui lòng điền đầy đủ họ tên và mức đóng góp"
      });
    }

    if (!donorId || !campaignId) {
      return res.status(400).json({
        message: 'fail',
        data: false,
        error: "Thiếu thông tin người dùng hoặc chiến dịch"
      });
    }

    if (sponsorAmount < 1000) {
      return res.status(400).json({
        message: 'fail',
        data: false,
        error: "Mức đóng góp thấp nhất là 1,000đ"
      });
    }

    // Verify campaign exists
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        message: 'fail',
        data: false,
        error: "Không tìm thấy chiến dịch"
      });
    }

    const transID = Math.floor(Math.random() * 1000000);
    const app_trans_id = `${moment().format("YYMMDD")}_${transID}`;

    // Create donation record with PENDING status
    const donation = await Donation.create({
      donorId,
      campaignId,
      amount: sponsorAmount,
      currency: 'VND',
      message: donationMessage,
      paymentMethod: 'ZALOPAY',
      transactionCode: app_trans_id,
      isAnonymous,
      status: 'PENDING'
    });

    const embed_data = {
      redirecturl: urlCalbackSuccess || "",
      merchantinfo: "Charity Donation",
      donationId: donation._id.toString()
    };

    const items = [{
      itemid: hostID || donation._id.toString(),
      itemname: campName || campaign.campName,
      itemprice: sponsorAmount,
      itemquantity: 1
    }];

    const order = {
      app_id: config.app_id,
      app_trans_id: app_trans_id,
      app_user: fullName,
      app_time: Date.now(),
      amount: sponsorAmount,
      description: donationMessage || `Donation for ${campaign.campName}`,
      bank_code: "zalopayapp",
      item: JSON.stringify(items),
      embed_data: JSON.stringify(embed_data),
      callback_url: `${req.protocol}://${req.get('host')}/api/zalopay/callback`
    };

    // Create MAC signature
    const data =
      config.app_id + "|" +
      order.app_trans_id + "|" +
      order.app_user + "|" +
      order.amount + "|" +
      order.app_time + "|" +
      order.embed_data + "|" +
      order.item;

    order.mac = CryptoJS.HmacSHA256(data, config.key1).toString();

    console.log("Creating ZaloPay order:", { app_trans_id, amount: sponsorAmount, donationId: donation._id });

    const response = await axios.post(config.endpoint, null, { params: order });

    if (response.data.return_code === 1) {
      return res.status(200).json({
        success: true,
        message: 'Tạo đơn thanh toán thành công',
        data: {
          order_url: response.data.order_url,
          app_trans_id: app_trans_id,
          zp_trans_token: response.data.zp_trans_token,
          order_token: response.data.order_token,
          donationId: donation._id
        }
      });
    } else {
      // If ZaloPay order creation fails, update donation status to FAILED
      await Donation.findByIdAndUpdate(donation._id, { status: 'FAILED' });

      console.error("ZaloPay order creation failed:", response.data);
      return res.status(400).json({
        success: false,
        message: 'fail',
        error: response.data.return_message || "Không thể tạo đơn thanh toán ZaloPay"
      });
    }

  } catch (error) {
    console.error("ZaloPay order error:", error.message);
    return res.status(500).json({
      success: false,
      message: 'fail',
      error: "Lỗi hệ thống"
    });
  }
});

// ZaloPay callback handler with donation status update
router.post("/callback", async (req, res) => {
  let result = {};
  try {
    const { data: dataStr, mac: reqMac } = req.body;

    if (!dataStr || !reqMac) {
      result.return_code = -1;
      result.return_message = "Invalid callback data";
      return res.json(result);
    }

    console.log("ZaloPay callback received:", dataStr);

    // Verify MAC signature
    const mac = CryptoJS.HmacSHA256(dataStr, config.key2).toString();
    console.log("Calculated MAC:", mac);
    console.log("Received MAC:", reqMac);

    if (reqMac !== mac) {
      result.return_code = -1;
      result.return_message = "MAC verification failed";
      console.error("MAC verification failed");
    } else {
      const dataJson = JSON.parse(dataStr);
      const itemData = JSON.parse(dataJson.item);
      const embedData = JSON.parse(dataJson.embed_data);

      console.log("Payment successful for transaction:", dataJson.app_trans_id);
      console.log("Item data:", itemData);
      console.log("Amount:", dataJson.amount);

      // Update donation status to SUCCESSFUL
      const donation = await Donation.findOneAndUpdate(
        { transactionCode: dataJson.app_trans_id },
        {
          status: 'SUCCESSFUL',
          updatedAt: new Date()
        },
        { new: true }
      ).populate('campaignId');

      if (donation) {
        // Update campaign's current fund
        await Campaign.findByIdAndUpdate(
          donation.campaignId._id,
          { $inc: { currentFund: donation.amount } }
        );

        console.log(`Donation ${donation._id} updated to SUCCESSFUL, campaign fund increased by ${donation.amount}`);

        // TODO: Send confirmation email/notification
        // await sendDonationConfirmation(donation);
      } else {
        console.error("Donation not found for transaction:", dataJson.app_trans_id);
      }

      result.return_code = 1;
      result.return_message = "success";
    }
  } catch (error) {
    console.error("Callback processing error:", error);
    result.return_code = 0;
    result.return_message = error.message;
  }

  res.json(result);
});

// Query order status with donation info
router.post("/query", async (req, res) => {
  try {
    const { app_trans_id } = req.body;

    if (!app_trans_id) {
      return res.status(400).json({
        success: false,
        error: "Thiếu mã giao dịch"
      });
    }

    // Query ZaloPay status
    const data = config.app_id + "|" + app_trans_id + "|" + config.key1;
    const mac = CryptoJS.HmacSHA256(data, config.key1).toString();

    const queryData = {
      app_id: config.app_id,
      app_trans_id: app_trans_id,
      mac: mac
    };

    const [zaloPayResponse, donation] = await Promise.all([
      axios.post(config.query_endpoint, null, { params: queryData }),
      Donation.findOne({ transactionCode: app_trans_id })
        .populate('donorId', 'name email')
        .populate('campaignId', 'campName totalGoal currentFund')
    ]);

    return res.json({
      success: zaloPayResponse.data.return_code === 1,
      data: {
        zalopay: zaloPayResponse.data,
        donation: donation
      }
    });

  } catch (error) {
    console.error("Query order error:", error);
    return res.status(500).json({
      success: false,
      error: "Không thể truy vấn trạng thái đơn hàng"
    });
  }
});

// Refund order with donation status update
router.post("/refund", async (req, res) => {
  try {
    const { zp_trans_id, amount, description, app_trans_id } = req.body;

    if (!zp_trans_id || !amount) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin bắt buộc"
      });
    }

    // Find donation to verify refund eligibility
    const donation = await Donation.findOne({
      transactionCode: app_trans_id || zp_trans_id
    }).populate('campaignId');

    if (!donation) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy donation"
      });
    }

    if (donation.status !== 'SUCCESSFUL') {
      return res.status(400).json({
        success: false,
        error: "Chỉ có thể hoàn tiền cho donation đã thành công"
      });
    }

    const timestamp = Date.now();
    const uid = `${timestamp}${Math.floor(111 + Math.random() * 999)}`;

    const refundData = {
      app_id: config.app_id,
      zp_trans_id: zp_trans_id,
      amount: amount,
      description: description || "Hoàn tiền donation",
      timestamp: timestamp,
      uid: uid
    };

    const data = config.app_id + "|" + zp_trans_id + "|" + amount + "|" +
      (description || "Hoàn tiền donation") + "|" + timestamp + "|" + uid;
    refundData.mac = CryptoJS.HmacSHA256(data, config.key1).toString();

    const response = await axios.post(config.refund_endpoint, null, { params: refundData });

    if (response.data.return_code === 1) {
      // Update donation status to REFUNDED
      await Donation.findByIdAndUpdate(donation._id, {
        status: 'REFUNDED',
        updatedAt: new Date()
      });

      // Decrease campaign's current fund
      await Campaign.findByIdAndUpdate(
        donation.campaignId._id,
        { $inc: { currentFund: -amount } }
      );

      console.log(`Donation ${donation._id} refunded, campaign fund decreased by ${amount}`);
    }

    return res.json({
      success: response.data.return_code === 1,
      message: response.data.return_code === 1 ? 'Hoàn tiền thành công' : 'Hoàn tiền thất bại',
      data: response.data
    });

  } catch (error) {
    console.error("Refund error:", error);
    return res.status(500).json({
      success: false,
      error: "Không thể xử lý hoàn tiền"
    });
  }
});

// Additional donation-related routes

// Get donation by transaction code
router.get("/donation/:transactionCode", async (req, res) => {
  try {
    const { transactionCode } = req.params;

    const donation = await Donation.findOne({ transactionCode })
      .populate('donorId', 'name email phone')
      .populate('campaignId', 'campName campDescription totalGoal currentFund');

    if (!donation) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy donation"
      });
    }

    return res.json({
      success: true,
      data: { donation }
    });

  } catch (error) {
    console.error("Get donation error:", error);
    return res.status(500).json({
      success: false,
      error: "Lỗi hệ thống"
    });
  }
});

// Get donations by campaign
router.get("/donations/campaign/:campaignId", DonationController.getDonationsByCampaign);

// Get donations by user
router.get("/donations/user/:userId", DonationController.getDonationsByUser);

// Get donation statistics
router.get("/donations/stats", DonationController.getDonationStats);

// Update donation status manually (admin only)
router.patch("/donation/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Thiếu trạng thái"
      });
    }

    const validStatuses = ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Trạng thái không hợp lệ"
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
        success: false,
        error: "Không tìm thấy donation"
      });
    }

    // Update campaign fund if status changed to SUCCESSFUL
    if (status === 'SUCCESSFUL') {
      await Campaign.findByIdAndUpdate(
        donation.campaignId._id,
        { $inc: { currentFund: donation.amount } }
      );
    }

    return res.json({
      success: true,
      message: 'Cập nhật trạng thái thành công',
      data: { donation }
    });

  } catch (error) {
    console.error("Update donation status error:", error);
    return res.status(500).json({
      success: false,
      error: "Lỗi hệ thống"
    });
  }
});

module.exports = router;
