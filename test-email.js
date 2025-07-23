require('dotenv').config();
const { sendConfirmationEmail } = require('./middleware/emailService');

async function testEmailService() {
  try {
    console.log('Testing email service...');
    console.log('GMAIL_USER:', process.env.GMAIL_USER);
    console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '***SET***' : '***NOT SET***');
    
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error('❌ Email configuration missing!');
      console.error('Please set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file');
      return;
    }

    const testEmail = process.env.GMAIL_USER; // Send to yourself for testing
    const testCode = '123456';
    
    console.log(`Sending test email to: ${testEmail}`);
    const result = await sendConfirmationEmail(testEmail, testCode);
    
    console.log('✅ Email sent successfully!');
    console.log('Result:', result.response);
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.error('Full error:', error);
  }
}

testEmailService(); 