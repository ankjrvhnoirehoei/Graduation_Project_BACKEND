const express = require('express');
const router = express.Router();
const { createPaymentIntent, webhook } = require('../controllers/stripeController.js');

router.post('/payment-intent', createPaymentIntent);

router.post('/webhook', webhook);

module.exports = router;