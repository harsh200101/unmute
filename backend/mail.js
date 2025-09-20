const nodemailer = require('nodemailer');
require('dotenv').config(); // If using env vars
(async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // or true for SSL
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    const info = await transporter.sendMail({
      from: 'harshgajbhiye34@gmail.com',
      to: 'harshgajbhiye722@gmail.com', // Use a different test address
      subject: 'Test Email',
      text: 'This is a test.'
    });
    console.log('Test email sent:', info.response);
  } catch (error) {
    console.error('Test email error:', error);
  }
})();
