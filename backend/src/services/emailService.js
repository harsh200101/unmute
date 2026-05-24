'use strict';

// Provider-agnostic email service.
//
// Providers wired:
//   - stub      (dev: logs to stdout)
//   - sendgrid  (HTTPS, works on Render where SMTP is blocked)
//   - resend    (HTTPS, alternative to SendGrid)
//   - smtp      (nodemailer — only works off Render, e.g. local dev)
//
// Every send is logged to `email_log` so we have a server-side audit
// trail independent of any provider dashboard. Tests skip logging to
// keep the test DB clean (they assert on global.__SENT_EMAILS__).

const env = require('../config/env');
const { query } = require('../config/db');

async function sendEmail({ to, subject, text, html, attachments, kind }) {
  if (env.NODE_ENV === 'test') {
    // Capture in a global for tests to assert on
    global.__SENT_EMAILS__ = global.__SENT_EMAILS__ || [];
    global.__SENT_EMAILS__.push({ to, subject, text, html, attachments, kind });
    return { provider: 'test', id: `test-${Date.now()}` };
  }

  let result;
  let errMsg = null;
  let errMeta = null;
  try {
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
      result = { provider: 'stub', id: `stub-${Date.now()}` };
    } else if (env.EMAIL_PROVIDER === 'smtp') {
      result = await sendViaSmtp({ to, subject, text, html, attachments });
    } else if (env.EMAIL_PROVIDER === 'resend') {
      result = await sendViaResend({ to, subject, text, html, attachments });
    } else if (env.EMAIL_PROVIDER === 'sendgrid') {
      result = await sendViaSendGrid({ to, subject, text, html, attachments });
    } else {
      throw new Error(`Email provider '${env.EMAIL_PROVIDER}' is not wired yet`);
    }
  } catch (err) {
    errMsg = err.message;
    errMeta = { stack: (err.stack || '').slice(0, 1000) };
    // Re-throw after logging so callers (fire-and-forget paths) still see it.
    logEmailAttempt({ to, subject, kind, status: 'failed', provider: env.EMAIL_PROVIDER || 'stub', provider_msg_id: null, error_message: errMsg, meta: errMeta });
    throw err;
  }

  // Don't block the caller on the audit-log write — it's best-effort.
  logEmailAttempt({
    to,
    subject,
    kind,
    status: 'accepted',
    provider: result.provider,
    provider_msg_id: result.id || null,
    error_message: null,
    meta: { provider_response: result },
  });
  return result;
}

// Fire-and-forget audit write. We never want a logging hiccup to break a
// real email send, so swallow errors. Truncate long values defensively.
function logEmailAttempt({ to, subject, kind, status, provider, provider_msg_id, error_message, meta }) {
  query(
    `INSERT INTO email_log (to_email, subject, kind, provider, provider_msg_id, status, error_message, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      String(Array.isArray(to) ? to[0] : to).slice(0, 320),
      String(subject || '').slice(0, 998),
      kind || null,
      provider || 'unknown',
      provider_msg_id ? String(provider_msg_id).slice(0, 200) : null,
      status,
      error_message ? String(error_message).slice(0, 2000) : null,
      meta || null,
    ]
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[email_log] failed to record send', err.message);
  });
}

// --- SendGrid (HTTPS API) --------------------------------------------------
//
// Like Resend, SendGrid's v3 API runs over plain HTTPS so it works around
// Render's outbound-SMTP block. Free tier: 100 emails/day forever, allows a
// single verified sender (e.g. a Gmail address) without needing a domain.
//
// Get an API key at https://app.sendgrid.com/settings/api_keys (scopes:
// "Mail Send" is enough). Verify the FROM address at Settings → Sender
// Authentication → Single Sender Verification before the first send.
async function sendViaSendGrid({ to, subject, text, html, attachments }) {
  if (!env.SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid');
  if (!env.EMAIL_FROM) throw new Error('EMAIL_FROM is required when EMAIL_PROVIDER=sendgrid');

  const content = [];
  if (text) content.push({ type: 'text/plain', value: text });
  if (html) content.push({ type: 'text/html',  value: html });
  if (content.length === 0) content.push({ type: 'text/plain', value: ' ' }); // SendGrid rejects empty body

  const body = {
    personalizations: [{
      to: (Array.isArray(to) ? to : [to]).map((email) => ({ email })),
    }],
    from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME || 'unmute' },
    subject,
    content,
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
            type: a.contentType,
            disposition: 'attachment',
          })),
        }
      : {}),
  };

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    let detail = '';
    try { detail = JSON.stringify(await resp.json()); } catch { /* ignore */ }
    throw new Error(`SendGrid API ${resp.status} ${resp.statusText}: ${detail}`);
  }
  // SendGrid returns 202 Accepted with empty body. Use the X-Message-Id header
  // as the id we return.
  const id = resp.headers.get('X-Message-Id') || `sendgrid-${Date.now()}`;
  return { provider: 'sendgrid', id };
}

// --- Resend (HTTPS API) ----------------------------------------------------
//
// Render's free/starter tier blocks outbound SMTP, but HTTPS is always open.
// Resend gives us 3,000 emails/month on the free plan with a simple POST.
// Get an API key at https://resend.com → API Keys.
//
// `EMAIL_FROM` must either be on a domain you've verified in Resend, OR you
// can use the testing-only address `onboarding@resend.dev` to send to YOUR
// own address while a domain is being set up.

async function sendViaResend({ to, subject, text, html, attachments }) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
  if (!env.EMAIL_FROM) throw new Error('EMAIL_FROM is required when EMAIL_PROVIDER=resend');

  const body = {
    from: env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
            content_type: a.contentType,
          })),
        }
      : {}),
  };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    // Cap network call at 10 s — same rationale as SMTP timeouts.
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    let detail = '';
    try { detail = JSON.stringify(await resp.json()); } catch { /* ignore */ }
    throw new Error(`Resend API ${resp.status} ${resp.statusText}: ${detail}`);
  }
  const data = await resp.json();
  return { provider: 'resend', id: data.id };
}

// --- SMTP (nodemailer) ------------------------------------------------------

let _smtpTransport = null;
function getSmtpTransport() {
  if (_smtpTransport) return _smtpTransport;
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  _smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // false for 587 (STARTTLS), true for 465 (TLS)
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
    // Render's free/starter tiers block outbound SMTP, and other hosts
    // throttle aggressively. Cap every step at ~10 s so a bad SMTP host
    // can't hang user-facing requests for 30 s before failing.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return _smtpTransport;
}

async function sendViaSmtp({ to, subject, text, html, attachments }) {
  if (!env.SMTP_HOST) throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
  const t = getSmtpTransport();
  const info = await t.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return { provider: 'smtp', id: info.messageId };
}

// --- Convenience builders ---------------------------------------------------

function verificationEmail({ to, full_name, link }) {
  return {
    to,
    kind: 'verification',
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
    kind: 'booking_confirmed',
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
    kind: 'booking_cancelled',
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
    kind: 'reschedule_proposed',
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
    kind: 'reschedule_accepted',
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
    kind: 'reschedule_declined',
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
    kind: 'password_reset',
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
