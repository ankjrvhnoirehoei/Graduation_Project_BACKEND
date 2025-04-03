const express = require('express');
const router = express.Router();
<<<<<<< Updated upstream
const { createPaymentIntent, webhook } = require('../controllers/stripeController.js');

router.post('/payment-intent', createPaymentIntent);

router.post('/webhook', webhook);
=======
const bodyParser = require('body-parser');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const mDonation = require('../models/donation-model');
const mCampaign = require('../models/campaign-model');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/create-intent',
  bodyParser.json(),
  catchAsync(async (req, res) => {
    const {amount, userId, campaignId, message } = req.body;
    const intent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      confirm: true,
      metadate: {
        userId: userId,
        campaignId: campaignId,
        message: message
      },
      // In the latest version of the API,
      // Specifying the `automatic_payment_methods` parameter is optional 
      // Because Stripe enables its functionality by default.
      automatic_payment_methods: {enabled: true},
    });
    res.json({     
      cilentSecret: intent.client_secret,
      publishableKey: 'pk_test_51R2bmCPJI0ZSIRRMWPvIG84b4kJGIKsm7OELZ0HDrrkF7qtta8WqBSmYYXR7LPKt40ROE8SD69ku77SDcME4Kdrz00kNyDt9DZ',
      metadata: intent.metadata,
    });
  })
);
>>>>>>> Stashed changes

module.exports = router;