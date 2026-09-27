'use strict';

// Email service — Gmail over SMTP (nodemailer) is the only transport.
//
// Why Gmail and nothing else:
//   - SendGrid: removed. Its free tier was retired, so it can no longer be the
//     zero-cost default for a project at this stage.
//   - Resend: removed. Its free tier can only send from onboarding@resend.dev,
//     which delivers exclusively to the address owning the Resend account.
//     That makes it impossible to send from a real Gmail address like
//     theunmute24@gmail.com, which is what this project needs.
//
// Operational notes for whoever deploys this:
//   * SMTP_PASS must be a 16-character Google App Password
//     (https://myaccount.google.com/apppasswords, requires 2-Step Verification),
//     never the Gmail account password. Gmail rejects the latter.
//   * Render blocks outbound SMTP on ports 25/465/587 for FREE web services
//     (since 26 Sep 2025). Paid instances may use 465/587. A free instance
//     will hang on connect and every send will fail with a timeout.
//   * A consumer Gmail account has a hard daily send cap (~500/day) and will
//     start rejecting or quarantining mail well before a product needs it. Fine
//     for launch, not for scale.
//
// Every send is logged to `email_log` so we have a server-side audit trail
// independent of the mail provider, and mirrored to stdout with a greppable
// `[email:...]` prefix so a delivery failure is visible in the host's log
// stream. Tests skip logging to keep the test DB clean (they assert on
// global.__SENT_EMAILS__).

const env = require('../config/env');
const { query } = require('../config/db');

// --- Logging helpers --------------------------------------------------------
//
// One line per send attempt, always, on every provider. Written to stdout so
// it lands in Render's log stream, where it can be grepped/filtered by the
// `kind` (e.g. `[email:send] kind=verification`).
function logSend(level, fields) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : v}`);
  // eslint-disable-next-line no-console
  console[level](`[email:${fields.stage || 'send'}] ${parts.join(' ')}`);
}

async function sendEmail({ to, subject, text, html, attachments, kind }) {
  const startedAt = Date.now();
  const recipient = Array.isArray(to) ? to.join(',') : to;

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
      console.log('\n=== EMAIL (stub provider — NOT DELIVERED) ===');
      // eslint-disable-next-line no-console
      console.log('To:     ', to);
      // eslint-disable-next-line no-console
      console.log('Subject:', subject);
      // eslint-disable-next-line no-console
      console.log('Body:\n', text || html);
      // eslint-disable-next-line no-console
      console.log('===========================================\n');
      result = { provider: 'stub', id: `stub-${Date.now()}` };
      // This is the line that would have saved hours: stub means the mail was
      // printed and thrown away, so nobody ever receives a verification link.
      logSend('warn', {
        stage: 'send',
        kind,
        to: recipient,
        provider: 'stub',
        outcome: 'NOT_DELIVERED',
        hint: 'set EMAIL_PROVIDER + EMAIL_FROM + API key on your host to actually send',
      });
    } else if (env.EMAIL_PROVIDER === 'smtp') {
      result = await sendViaSmtp({ to, subject, text, html, attachments });
    } else {
      throw new Error(`Email provider '${env.EMAIL_PROVIDER}' is not wired yet`);
    }
  } catch (err) {
    // Gmail's raw errors ("Invalid credentials: 535 ...") rarely say what to
    // actually do, and a Render connect timeout looks nothing like a bad
    // password. Replace the message with the actionable version before it
    // reaches the log or the email_log table.
    const readable = describeSmtpError(err);
    errMsg = readable;
    errMeta = {
      code: err.code || null,
      command: err.command || null,
      responseCode: err.responseCode || null,
      stack: (err.stack || '').slice(0, 1000),
    };
    logSend('error', {
      stage: 'send-failed',
      kind,
      to: recipient,
      subject,
      provider: env.EMAIL_PROVIDER || 'stub',
      smtp_code: err.code || null,
      ms: Date.now() - startedAt,
      error: readable,
    });
    // Re-throw after logging so callers (fire-and-forget paths) still see it.
    logEmailAttempt({ to, subject, kind, status: 'failed', provider: env.EMAIL_PROVIDER || 'stub', provider_msg_id: null, error_message: errMsg, meta: errMeta });
    throw err;
  }

  logSend('info', {
    stage: 'send',
    kind,
    to: recipient,
    subject,
    provider: result.provider,
    provider_msg_id: result.id,
    ms: Date.now() - startedAt,
    outcome: result.provider === 'stub' ? 'NOT_DELIVERED' : 'accepted',
  });

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

// --- Gmail over SMTP (nodemailer) -------------------------------------------
//
// Setup, in order:
//   1. Turn on 2-Step Verification at https://myaccount.google.com/security
//   2. Create a 16-character App Password at
//      https://myaccount.google.com/apppasswords
//   3. Set SMTP_USER to the Gmail address and SMTP_PASS to that App Password
//      (spaces removed). env.js fills in SMTP_HOST=smtp.gmail.com,
//      SMTP_PORT=587 and EMAIL_FROM=SMTP_USER automatically.
//
// Gotchas encoded below:
//   * 587 is STARTTLS (secure: false, then upgrade), 465 is implicit TLS
//     (secure: true). Picking the wrong pairing fails the handshake.
//   * Gmail refuses the real account password, so a 535 here almost always
//     means "that's not an App Password".
//   * A From address other than the authenticated account is silently
//     rewritten by Gmail. env.js now rejects that mismatch at boot.
//   * Render blocks SMTP ports on free web services, so a connect timeout
//     (ECONNREFUSED / ETIMEDOUT) usually means the instance is on the free
//     tier rather than a credential problem.
//
// An earlier version of this file defaulted EMAIL_FROM to
// 'no-reply@unmute.local', which made the `!env.EMAIL_FROM` guard dead code —
// the value was never empty. env.js now defaults it to ''.

let _smtpTransport = null;
function getSmtpTransport() {
  if (_smtpTransport) return _smtpTransport;
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  _smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 = implicit TLS; 587 = STARTTLS after plaintext greeting.
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
    // Cap every step at ~10 s. Render and Gmail both throttle or drop
    // connections, and a hung SMTP socket would otherwise stall a
    // user-facing request for the full 30 s socket default.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return _smtpTransport;
}

async function sendViaSmtp({ to, subject, text, html, attachments }) {
  if (!env.SMTP_HOST) throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
  if (!env.SMTP_USER) throw new Error('SMTP_USER is required when EMAIL_PROVIDER=smtp');
  if (!env.SMTP_PASS) throw new Error('SMTP_PASS is required when EMAIL_PROVIDER=smtp');

  const t = getSmtpTransport();
  const info = await t.sendMail({
    // Gmail rewrites any From that isn't the authenticated account, so pin
    // them together and make the display name explicit.
    from: { name: env.EMAIL_FROM_NAME || 'unmute', address: env.EMAIL_FROM || env.SMTP_USER },
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
  return { provider: 'smtp', id: info.messageId, response: info.response };
}

/**
 * Turn a raw nodemailer/Gmail failure into something actionable in a log.
 * Gmail's auth errors are famously opaque, and a connect timeout on Render is
 * almost always the free-tier SMTP block rather than bad credentials.
 */
function describeSmtpError(err) {
  const code = err?.code || '';
  if (code === 'EAUTH' || /535|Invalid credentials/i.test(err?.response || '')) {
    return (
      `${err.message} — Gmail rejected the credentials. SMTP_PASS must be a ` +
      '16-character App Password from https://myaccount.google.com/apppasswords, ' +
      'not the Gmail account password.'
    );
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENETUNREACH') {
    return (
      `${err.message} — could not reach ${env.SMTP_HOST}:${env.SMTP_PORT}. ` +
      'Render blocks outbound SMTP (25/465/587) on FREE web services; this needs a paid instance.'
    );
  }
  if (/421|4\.7\.0|unavailable/i.test(err?.response || '')) {
    return (
      `${err.message} — Gmail is rate-limiting or temporarily blocking this ` +
      'account. Consumer Gmail caps out around 500 messages/day and will start ' +
      'refusing sends well before that.'
    );
  }
  return err.message;
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
