const nodemailer = require('nodemailer');
require('dotenv').config();

const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

async function sendConfirmationEmail(to, confirmationCode) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD, // Use App Password instead of OAuth2
      },
    });

    const mailOptions = {
      from: `Your App <${GMAIL_USER}>`,
      to,
      subject: 'Email Confirmation Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #333; text-align: center;">Email Confirmation</h2>
          <p style="color: #666; font-size: 16px;">Hello,</p>
          <p style="color: #666; font-size: 16px;">You have requested to update your email address. Please use the following confirmation code to complete the process:</p>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 6px; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 4px;">${confirmationCode}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 5 minutes for security reasons.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this change, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
        </div>
      `,
      text: `Your confirmation code is: ${confirmationCode}. This code will expire in 5 minutes.`,
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
