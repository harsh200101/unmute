const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Send verification email
const sendVerificationEmail = async (to, verificationUrl) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Verify Your Email - Unmute Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Unmute Platform!</h2>
        <p>Please verify your email address to complete your registration.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}"
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      Welcome to Unmute Platform!

      Please verify your email address by clicking this link:
      ${verificationUrl}

      This link will expire in 24 hours.

      If you didn't create an account, please ignore this email.

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (to, resetUrl) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Reset Your Password - Unmute Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You requested a password reset for your Unmute Platform account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}"
             style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      Password Reset Request

      You requested a password reset for your Unmute Platform account.

      Click this link to reset your password:
      ${resetUrl}

      This link will expire in 1 hour.

      If you didn't request this reset, please ignore this email.

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    throw error;
  }
};

// Send session rescheduled email
const sendSessionRescheduledEmail = async (to, sessionData) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Session Rescheduled - Unmute Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Session Rescheduled</h2>
        <p>Your mentoring session has been rescheduled.</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${sessionData.title || 'Mentoring Session'}</h3>
          <p><strong>New Date & Time:</strong> ${new Date(sessionData.scheduledAt).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${sessionData.durationMinutes} minutes</p>
          <p><strong>Session Type:</strong> ${sessionData.sessionType}</p>
          ${sessionData.meetingUrl ? `<p><strong>Meeting Link:</strong> <a href="${sessionData.meetingUrl}">${sessionData.meetingUrl}</a></p>` : ''}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/sessions"
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Session Details
          </a>
        </div>

        <p>If you have any questions, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      Session Rescheduled

      Your mentoring session has been rescheduled.

      ${sessionData.title || 'Mentoring Session'}
      New Date & Time: ${new Date(sessionData.scheduledAt).toLocaleString()}
      Duration: ${sessionData.durationMinutes} minutes
      Session Type: ${sessionData.sessionType}
      ${sessionData.meetingUrl ? `Meeting Link: ${sessionData.meetingUrl}` : ''}

      View your sessions: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/sessions

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Session rescheduled email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send session rescheduled email:', error);
    throw error;
  }
};

// Send reschedule request email
const sendRescheduleRequestEmail = async (to, sessionData, requesterName) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Reschedule Request - Unmute Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Reschedule Request</h2>
        <p>${requesterName} has requested to reschedule your mentoring session.</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${sessionData.title || 'Mentoring Session'}</h3>
          <p><strong>Current Date & Time:</strong> ${new Date(sessionData.scheduledAt).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${sessionData.durationMinutes} minutes</p>
          <p><strong>Requested by:</strong> ${requesterName}</p>
        </div>

        <p>You can accept the reschedule request or cancel the session (with full refund) through your dashboard.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/sessions"
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Review Request
          </a>
        </div>

        <p>If you have any questions, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      Reschedule Request

      ${requesterName} has requested to reschedule your mentoring session.

      ${sessionData.title || 'Mentoring Session'}
      Current Date & Time: ${new Date(sessionData.scheduledAt).toLocaleString()}
      Duration: ${sessionData.durationMinutes} minutes
      Requested by: ${requesterName}

      Review the request: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/sessions

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Reschedule request email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send reschedule request email:', error);
    throw error;
  }
};

// Send session cancelled email
const sendSessionCancelledEmail = async (to, sessionData, reason) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Session Cancelled - Unmute Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Session Cancelled</h2>
        <p>Your mentoring session has been cancelled.</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${sessionData.title || 'Mentoring Session'}</h3>
          <p><strong>Scheduled Date & Time:</strong> ${new Date(sessionData.scheduledAt).toLocaleString()}</p>
          <p><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
        </div>

        ${sessionData.refundAmount ? `
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #155724;"><strong>Refund Processed:</strong> $${sessionData.refundAmount} has been refunded to your account.</p>
        </div>
        ` : ''}

        <p>If you have any questions, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      Session Cancelled

      Your mentoring session has been cancelled.

      ${sessionData.title || 'Mentoring Session'}
      Scheduled Date & Time: ${new Date(sessionData.scheduledAt).toLocaleString()}
      Reason: ${reason || 'No reason provided'}

      ${sessionData.refundAmount ? `Refund Processed: $${sessionData.refundAmount} has been refunded to your account.` : ''}

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Session cancelled email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send session cancelled email:', error);
    throw error;
  }
};

// Send meeting invite email
const sendMeetingInviteEmail = async (to, meetingData, recipientType = 'mentee') => {
  const transporter = createTransporter();

  const isMentee = recipientType === 'mentee';
  const greeting = isMentee ? 'You have been invited to a mentoring session' : 'You have a mentoring session scheduled';
  const actionText = isMentee ? 'Join Session' : 'Start Session';

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `Meeting Invite: ${meetingData.title || 'Mentoring Session'} - Unmute Platform`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${greeting}</h2>
        <p>Your video mentoring session is scheduled and ready.</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${meetingData.title || 'Mentoring Session'}</h3>
          <p><strong>Date & Time:</strong> ${new Date(meetingData.scheduledAt).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${meetingData.durationMinutes} minutes</p>
          <p><strong>Mentor:</strong> ${meetingData.mentorName}</p>
          <p><strong>Mentee:</strong> ${meetingData.menteeName}</p>
          <p><strong>Channel:</strong> ${meetingData.channelName}</p>
        </div>

        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;"><strong>Important:</strong> You can join the meeting 15 minutes before the scheduled start time. The meeting will automatically end after 1 hour and 15 minutes.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${meetingData.meetingUrl}"
             style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            ${actionText}
          </a>
        </div>

        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #004085;">Meeting Instructions:</h4>
          <ul style="color: #004085;">
            <li>Ensure you have a stable internet connection</li>
            <li>Test your camera and microphone before joining</li>
            <li>Join 5 minutes early to resolve any technical issues</li>
            <li>Only the scheduled mentor and mentee can join this meeting</li>
          </ul>
        </div>

        <p>If you have any questions or need technical support, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      ${greeting}

      Your video mentoring session is scheduled and ready.

      ${meetingData.title || 'Mentoring Session'}
      Date & Time: ${new Date(meetingData.scheduledAt).toLocaleString()}
      Duration: ${meetingData.durationMinutes} minutes
      Mentor: ${meetingData.mentorName}
      Mentee: ${meetingData.menteeName}
      Channel: ${meetingData.channelName}

      Join here: ${meetingData.meetingUrl}

      Important: You can join 15 minutes before the scheduled start time. The meeting will automatically end after 1 hour and 15 minutes.

      Meeting Instructions:
      - Ensure you have a stable internet connection
      - Test your camera and microphone before joining
      - Join 5 minutes early to resolve any technical issues
      - Only the scheduled mentor and mentee can join this meeting

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Meeting invite email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send meeting invite email:', error);
    throw error;
  }
};

// Send payment success email
const sendPaymentSuccessEmail = async (to, paymentData) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Payment Successful - Unmute Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Successful!</h2>
        <p>Thank you for your payment. Your transaction has been completed successfully.</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Payment Details</h3>
          <p><strong>Transaction ID:</strong> ${paymentData.transactionId}</p>
          <p><strong>Amount:</strong> ₹${paymentData.amount}</p>
          <p><strong>Session:</strong> ${paymentData.sessionTitle}</p>
          <p><strong>Mentor:</strong> ${paymentData.mentorName}</p>
          <p><strong>Scheduled:</strong> ${new Date(paymentData.scheduledAt).toLocaleString()}</p>
        </div>

        <p>Your session is now confirmed and the meeting room will be available closer to the session time.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/sessions"
             style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Your Sessions
          </a>
        </div>

        <p>If you have any questions, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      Payment Successful!

      Thank you for your payment. Your transaction has been completed successfully.

      Payment Details:
      Transaction ID: ${paymentData.transactionId}
      Amount: ₹${paymentData.amount}
      Session: ${paymentData.sessionTitle}
      Mentor: ${paymentData.mentorName}
      Scheduled: ${new Date(paymentData.scheduledAt).toLocaleString()}

      Your session is now confirmed and the meeting room will be available closer to the session time.

      View your sessions: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/sessions

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Payment success email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send payment success email:', error);
    throw error;
  }
};

// Send meeting ready email
const sendMeetingReadyEmail = async (to, meetingData, recipientType = 'mentee') => {
  const transporter = createTransporter();

  const isMentee = recipientType === 'mentee';
  const greeting = isMentee ? 'Your mentoring session is now ready!' : 'Your mentoring session is now ready!';
  const actionText = isMentee ? 'Join Session' : 'Start Session';

  const mailOptions = {
    from: `"Unmute Platform" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `Session Confirmed: ${meetingData.title || 'Mentoring Session'} - Unmute Platform`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${greeting}</h2>
        <p>Your payment has been processed successfully and your mentoring session is now confirmed.</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${meetingData.title || 'Mentoring Session'}</h3>
          <p><strong>Date & Time:</strong> ${new Date(meetingData.scheduledAt).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${meetingData.durationMinutes} minutes</p>
          <p><strong>Mentor:</strong> ${meetingData.mentorName}</p>
          <p><strong>Mentee:</strong> ${meetingData.menteeName}</p>
          <p><strong>Meeting Platform:</strong> Agora Video</p>
        </div>

        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;"><strong>Important:</strong> You can join the meeting 15 minutes before the scheduled start time. The meeting will automatically end after 1 hour and 15 minutes.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${meetingData.meetingUrl}"
             style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            ${actionText}
          </a>
        </div>

        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #004085;">Meeting Instructions:</h4>
          <ul style="color: #004085;">
            <li>Ensure you have a stable internet connection</li>
            <li>Test your camera and microphone before joining</li>
            <li>Join 5 minutes early to resolve any technical issues</li>
            <li>Only the scheduled mentor and mentee can join this meeting</li>
          </ul>
        </div>

        <p>If you have any questions or need technical support, please contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Unmute Platform - Connecting Mentors and Mentees</p>
      </div>
    `,
    text: `
      ${greeting}

      Your payment has been processed successfully and your mentoring session is now confirmed.

      ${meetingData.title || 'Mentoring Session'}
      Date & Time: ${new Date(meetingData.scheduledAt).toLocaleString()}
      Duration: ${meetingData.durationMinutes} minutes
      Mentor: ${meetingData.mentorName}
      Mentee: ${meetingData.menteeName}
      Meeting Platform: Agora Video

      Join here: ${meetingData.meetingUrl}

      Important: You can join 15 minutes before the scheduled start time. The meeting will automatically end after 1 hour and 15 minutes.

      Meeting Instructions:
      - Ensure you have a stable internet connection
      - Test your camera and microphone before joining
      - Join 5 minutes early to resolve any technical issues
      - Only the scheduled mentor and mentee can join this meeting

      Unmute Platform - Connecting Mentors and Mentees
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Meeting ready email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send meeting ready email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSessionRescheduledEmail,
  sendRescheduleRequestEmail,
  sendSessionCancelledEmail,
  sendMeetingInviteEmail,
  sendPaymentSuccessEmail,
  sendMeetingReadyEmail
};