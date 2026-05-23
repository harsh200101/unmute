'use strict';

// Provider-agnostic email service.
//
// Phase 1: only the `stub` provider is wired. It logs the email to stdout
// so dev flows still work — copy the link from the log into the browser.
//
// Phase later: add `resend` or `smtp` provider impls and select via
// EMAIL_PROVIDER env var. The public API (sendEmail) stays the same.

const env = require('../config/env');

async function sendEmail({ to, subject, text, html, attachments }) {
  if (env.NODE_ENV === 'test') {
    // Capture in a global for tests to assert on
    global.__SENT_EMAILS__ = global.__SENT_EMAILS__ || [];
    global.__SENT_EMAILS__.push({ to, subject, text, html, attachments });
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

// --- Booking lifecycle templates -------------------------------------------

function formatLocal(iso, tz = 'Asia/Kolkata') {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch (_) {
    return new Date(iso).toISOString();
  }
}

function bookingConfirmedEmail({ to, full_name, other_name, slot_start_at, slot_end_at, mentee_title, ics_string, viewer_tz = 'Asia/Kolkata' }) {
  return {
    to,
    subject: `Booking confirmed: session with ${other_name}`,
    text: [
      `Hi ${full_name || ''},`,
      '',
      `Your session with ${other_name} is confirmed.`,
      `When:    ${formatLocal(slot_start_at, viewer_tz)} – ${formatLocal(slot_end_at, viewer_tz)}`,
      mentee_title ? `Topic:   ${mentee_title}` : null,
      '',
      'A calendar invite is attached. The Join button on your dashboard will go live 5 minutes before start time.',
    ].filter((l) => l !== null).join('\n'),
    attachments: ics_string ? [{ filename: 'invite.ics', content: ics_string, contentType: 'text/calendar; method=REQUEST' }] : undefined,
  };
}

function bookingCancelledEmail({ to, full_name, other_name, slot_start_at, by, reason, viewer_tz = 'Asia/Kolkata' }) {
  return {
    to,
    subject: `Booking cancelled: session with ${other_name}`,
    text: [
      `Hi ${full_name || ''},`,
      '',
      `The session with ${other_name} on ${formatLocal(slot_start_at, viewer_tz)} has been cancelled${by ? ` by the ${by}` : ''}.`,
      reason ? `Reason: ${reason}` : null,
      '',
      'You can book another slot anytime from your dashboard.',
    ].filter((l) => l !== null).join('\n'),
  };
}

function rescheduleProposedEmail({ to, full_name, other_name, old_slot, new_slot, viewer_tz = 'Asia/Kolkata' }) {
  return {
    to,
    subject: `Reschedule request from ${other_name}`,
    text: [
      `Hi ${full_name || ''},`,
      '',
      `${other_name} has proposed moving your session:`,
      `From: ${formatLocal(old_slot, viewer_tz)}`,
      `To:   ${formatLocal(new_slot, viewer_tz)}`,
      '',
      'Accept or decline from your dashboard.',
    ].join('\n'),
  };
}

function rescheduleAcceptedEmail({ to, full_name, other_name, new_slot, ics_string, viewer_tz = 'Asia/Kolkata' }) {
  return {
    to,
    subject: `Session rescheduled with ${other_name}`,
    text: [
      `Hi ${full_name || ''},`,
      '',
      `${other_name} accepted the reschedule. Your session now starts ${formatLocal(new_slot, viewer_tz)}.`,
      '',
      'Updated calendar invite attached.',
    ].join('\n'),
    attachments: ics_string ? [{ filename: 'invite.ics', content: ics_string, contentType: 'text/calendar; method=REQUEST' }] : undefined,
  };
}

function rescheduleDeclinedEmail({ to, full_name, other_name, original_slot, viewer_tz = 'Asia/Kolkata' }) {
  return {
    to,
    subject: `Reschedule declined`,
    text: [
      `Hi ${full_name || ''},`,
      '',
      `${other_name} declined the reschedule. Your session is still scheduled for ${formatLocal(original_slot, viewer_tz)}.`,
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

module.exports = {
  sendEmail,
  verificationEmail,
  passwordResetEmail,
  bookingConfirmedEmail,
  bookingCancelledEmail,
  rescheduleProposedEmail,
  rescheduleAcceptedEmail,
  rescheduleDeclinedEmail,
};
