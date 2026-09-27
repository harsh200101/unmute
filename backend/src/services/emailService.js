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
        hint: 'set EMAIL_PROVIDER=smtp plus SMTP_USER and SMTP_PASS (Google App Password) on your host to actually send',
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
    // Force IPv4. Node 18+ (autoSelectFamily) and many container hosts will
    // happily resolve smtp.gmail.com to its AAAA record and then try to
    // connect over IPv6 on a network that has no route for it. The result is
    // "connect ENETUNREACH <ipv6>:587 - Local (:::0)" after burning the full
    // connection timeout, on a host whose IPv4 egress works fine. Gmail has
    // both A and AAAA records, so the address family is chosen by us, not DNS.
    family: 4,
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
 *
 * Matching has to consider the *message* as well as `err.code`, because
 * nodemailer wraps socket-level failures in an ESOCKET error and puts the
 * real code (ENETUNREACH, ETIMEDOUT, ECONNREFUSED) only in the message text.
 * A previous version matched on `err.code` alone, so every wrapped network
 * failure fell through to the bare message and the log said nothing useful.
 */
function describeSmtpError(err) {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  const response = err?.response || '';
  // Nodemailer surfaces the underlying socket error's code here.
  const inner = err?.cause?.code || err?.originalError?.code || '';
  const haystack = `${code} ${inner} ${msg}`;

  if (code === 'EAUTH' || /535|Invalid credentials|Username and Password not accepted/i.test(`${msg} ${response}`)) {
    // An app password belongs to exactly one Google account, and pairing it
    // with a different SMTP_USER is the single most common cause of this
    // rejection. Surface the length too, since a 16-char check settles the
    // "is this actually an app password?" question immediately.
    const passLen = (env.SMTP_PASS || '').length;
    return (
      `${msg} - Gmail rejected the credentials. SMTP_PASS must be a 16-character App ` +
      'Password (currently ' + passLen + ' chars) from https://myaccount.google.com/apppasswords, ' +
      'generated by the SAME account as SMTP_USER (' + env.SMTP_USER + '). ' +
      'An app password only works for the account that created it, and regenerating 2-Step ' +
      'Verification invalidates all existing app passwords.'
    );
  }

  // Distinguish "no route at all" from "blocked" from "hung". These have
  // genuinely different fixes and lumping them together sends people down the
  // wrong path (paying for a Render instance when the real problem is a
  // missing IPv6 route).
  const isIpv6Unreachable = /ENETUNREACH/.test(haystack) && /:\s*[0-9a-f]{0,4}:/.test(msg);
  if (isIpv6Unreachable) {
    return (
      `${msg} - resolved to an IPv6 address that this host has no route to. ` +
      'The transport is pinned to IPv4 (family: 4); if this persists the host ' +
      'has no IPv4 egress either.'
    );
  }
  if (/ECONNREFUSED/.test(haystack)) {
    return (
      `${msg} - the connection to ${env.SMTP_HOST}:${env.SMTP_PORT} was actively refused. ` +
      'Render blocks outbound SMTP (25/465/587) on FREE web services, so this needs a paid instance.'
    );
  }
  if (/ETIMEDOUT|ESOCKET|ECONNRESET|EHOSTUNREACH/.test(haystack) && !code.match(/^E?AUTH/)) {
    return (
      `${msg} - could not establish a connection to ${env.SMTP_HOST}:${env.SMTP_PORT} within the ` +
      '10s timeout. Render blocks outbound SMTP (25/465/587) on FREE web services, so this ' +
      'usually means a free instance; otherwise check the host firewall.'
    );
  }
  if (/421|4\.7\.0|unavailable|rate/i.test(response)) {
    return (
      `${msg} - Gmail is rate-limiting or temporarily blocking this account. ` +
      'Consumer Gmail caps out around 500 messages/day.'
    );
  }
  return msg;
}

// --- Convenience builders ---------------------------------------------------

// --- HTML email shell -------------------------------------------------------
//
// Every template below was plain text, so Gmail showed a raw 150-character
// URL sitting under the body copy. It looked broken and it wrapped mid-token.
// Both text and html are always sent: the HTML is for humans, and the plain
// text part is what keeps deliverability high and gives non-HTML clients
// something readable.
//
// Constraints that shaped this, all of them Gmail-specific:
//   * Tables for layout, not flex/grid. Gmail strips modern CSS.
//   * Inline styles only. A <style> block is unreliable across clients.
//   * A bulletproof CTA: a real <a> styled as a button, with the raw link as
//     visible fallback text underneath. If the button styling is dropped the
//     link is still clickable.
//   * webfont-safe system font stack; no external CSS, images or webfonts,
//     since those are blocked by default and would delay or suppress the mail.
//   * A plain-text part is mandatory, or Gmail marks it as a partial message.
const BRAND = 'Unmute';

// Escape before interpolating anything a user controls into HTML. full_name
// comes straight from the signup form, so without this a mentee could inject
// markup into every email they receive. The link is escaped for attribute
// context: the token contains '&' separators, and a bare '&' followed by text
// that looks like an entity is parsed as one, which truncates the URL.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailShell({ heading, intro, ctaLabel, link, footnote, mutedNote }) {
  // href must be attribute-escaped; the visible fallback text is the same
  // escaped string, which is also what the recipient should copy.
  const href = esc(link);
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f7f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">

          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #eef0f3;">
              <span style="font:600 20px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;letter-spacing:-0.2px;">${esc(BRAND)}</span>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 8px;">
              <h1 style="margin:0 0 16px;font:600 20px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">${esc(heading)}</h1>
              <p style="margin:0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#374151;">${esc(intro)}</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 32px 8px;">
              <a href="${href}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:14px 28px;border-radius:8px;">${esc(ctaLabel)}</a>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9ca3af;word-break:break-all;">
              If the button does not work, paste this link into your browser:<br>
              <a href="${href}" style="color:#4b5563;">${esc(link)}</a>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 28px;">
              <p style="margin:0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6b7280;">${esc(footnote)}</p>
              ${mutedNote ? `<p style="margin:12px 0 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9ca3af;">${esc(mutedNote)}</p>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function verificationEmail({ to, full_name, link }) {
  const name = full_name ? `Hi ${full_name},` : 'Hi there,';
  return {
    to,
    kind: 'verification',
    subject: `Verify your ${BRAND} email address`,
    text: [
      name,
      '',
      `Welcome to ${BRAND}. Confirm this email address to activate your account:`,
      link,
      '',
      'This link expires in 24 hours.',
      '',
      "If you didn't create a " + BRAND + ' account, you can ignore this message.',
    ].join('\n'),
    html: emailShell({
      heading: `Welcome to ${BRAND}`,
      intro: `${name} Confirm this email address to activate your account.`,
      ctaLabel: 'Verify email address',
      link,
      footnote: 'This link expires in 24 hours.',
      mutedNote: `If you didn't create a ${BRAND} account, you can safely ignore this message.`,
    }),
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
  const name = full_name ? `Hi ${full_name},` : 'Hi there,';
  return {
    to,
    kind: 'password_reset',
    subject: `Reset your ${BRAND} password`,
    text: [
      name,
      '',
      `A password reset was requested for your ${BRAND} account. Use the link below to choose a new password:`,
      link,
      '',
      'This link expires in 1 hour.',
      '',
      "If you didn't request this, you can ignore this message and your password will stay unchanged.",
    ].join('\n'),
    html: emailShell({
      heading: 'Reset your password',
      intro: `${name} We received a request to reset the password on your ${BRAND} account.`,
      ctaLabel: 'Choose a new password',
      link,
      // The security-relevant detail: say plainly what happens if this wasn't
      // them. A password reset mail that does not state this reads as alarming.
      footnote: 'This link expires in 1 hour.',
      mutedNote: `If you didn't request a password reset, ignore this email. Your password will not change unless you use the link above.`,
    }),
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
