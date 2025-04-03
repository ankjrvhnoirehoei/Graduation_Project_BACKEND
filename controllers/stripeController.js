const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY;
const ENDPOINT_SECRET = process.env.STRIPT_WEBHOOK_SECRET;
const Donation = require('../models/donation-model');
require('dotenv').config();

async function createPaymentIntent(req, res) {
  const { amount, currency = 'usd', userId, campaignId, message } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: {
        userId,
        campaignId,
        message: message || ''
      },
      payment_method_types: ['card']
    });

    await Donation.create({
      userID: userId,
      campID: campaignId,
      paymentMethod: 'stripe',
      status: 'pending',
      donationMessage: message || '',
      paymentCode: paymentIntent.id,
      sponsorAmount: amount,
      sponsorDate: new Date()
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function webhook(req, res) {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, ENDPOINT_SECRET);
    const eventObject = event.data.object;

    switch (event.type) {
      case 'payment_intent.succeeded':
        await Donation.findOneAndUpdate(
          { paymentCode: eventObject.id },
          {
            status: 'completed',
            sponsorAmount: eventObject.amount / 100
          }
        );
        console.log(`Payment succeeded: ${eventObject.id}`);
        break;

      case 'payment_intent.payment_failed':
        await Donation.findOneAndUpdate(
          { paymentCode: eventObject.id },
          { status: 'failed' }
        );
        console.log(`Payment failed: ${eventObject.id}`);
        break;
        
      case 'payment_intent.created':
        console.log(`Payment intent created: ${eventObject.id}`);
        break;
        
      case 'charge.succeeded':
        // Update donation status for successful charges
        if (eventObject.payment_intent) {
          await Donation.findOneAndUpdate(
            { paymentCode: eventObject.payment_intent },
            { status: 'completed' }
          );
          console.log(`Charge succeeded - updated donation for payment: ${eventObject.payment_intent}`);
        } else {
          console.log(`Charge succeeded but no payment_intent found: ${eventObject.id}`);
        }
        break;
        
      case 'charge.updated':
        // If charge is successful, update donation status
        if (eventObject.status === 'succeeded' && eventObject.payment_intent) {
          await Donation.findOneAndUpdate(
            { paymentCode: eventObject.payment_intent },
            { status: 'completed' }
          );
          console.log(`Charge updated to succeeded - updated donation for: ${eventObject.payment_intent}`);
        } else {
          console.log(`Charge updated: ${eventObject.id}, status: ${eventObject.status}`);
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });

  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}

module.exports = {
  createPaymentIntent,
  webhook
};