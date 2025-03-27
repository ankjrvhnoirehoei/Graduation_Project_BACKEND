const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REFRESH_TOKEN, GMAIL_USER } = process.env;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendConfirmationEmail(to, confirmationCode) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    const mailOptions = {
      from: `Your App <${GMAIL_USER}>`,
      to,
      subject: 'Email Confirmation Code',
      text: `Your confirmation code is: ${confirmationCode}`,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent:', result.response);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = { sendConfirmationEmail };
