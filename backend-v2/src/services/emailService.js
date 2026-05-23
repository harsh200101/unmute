'use strict';

// Provider-agnostic email service.
//
// Phase 1: only the `stub` provider is wired. It logs the email to stdout
// so dev flows still work — copy the link from the log into the browser.
//
// Phase later: add `resend` or `smtp` provider impls and select via
// EMAIL_PROVIDER env var. The public API (sendEmail) stays the same.

const env = require('../config/env');

async function sendEmail({ to, subject, text, html }) {
  if (env.NODE_ENV === 'test') {
    // Capture in a global for tests to assert on
    global.__SENT_EMAILS__ = global.__SENT_EMAILS__ || [];
    global.__SENT_EMAILS__.push({ to, subject, text, html });
    return { provider: 'test', id: `test-${Date.now()}` };
  }

  if (env.EMAIL_PROVIDER === 'stub' || !env.EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.log('\n=== EMAIL (stub provider) ===');
    // eslint-disable-next-line no-console
    console.log('To:     ', to);
    // eslint-disable-next-line no-console
    console.log('Subject:', subject);
    // eslint-disable-next-line no-console
    console.log('Body:\n', text || html);
    // eslint-disable-next-line no-console
    console.log('=============================\n');
    return { provider: 'stub', id: `stub-${Date.now()}` };
  }

  throw new Error(`Email provider '${env.EMAIL_PROVIDER}' is not wired yet (phase 1.x will add Resend/SMTP)`);
}

// --- Convenience builders ---------------------------------------------------

function verificationEmail({ to, full_name, link }) {
  return {
    to,
    subject: 'Verify your unmute email',
    text: [
      `Hi ${full_name || ''},`,
      '',
      'Welcome to unmute. Click the link below to verify your email address:',
      link,
      '',
      'This link expires in 24 hours.',
      '',
      "If you didn't sign up, you can ignore this message.",
    ].join('\n'),
  };
}

function passwordResetEmail({ to, full_name, link }) {
  return {
    to,
    subject: 'Reset your unmute password',
    text: [
      `Hi ${full_name || ''},`,
      '',
      'A password reset was requested for your account. Click the link below to choose a new password:',
      link,
      '',
      'This link expires in 1 hour.',
      '',
      "If you didn't request this, you can ignore the message.",
    ].join('\n'),
  };
}

module.exports = { sendEmail, verificationEmail, passwordResetEmail };
