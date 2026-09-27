'use strict';

require('dotenv').config();
const { z } = require('zod');

// --- Normalise before validating -------------------------------------------
//
// Gmail's own docs name these GMAIL_USER / GMAIL_APP_PASSWORD, while SMTP
// generically calls them SMTP_USER / SMTP_PASS. Accept both so the env vars
// match whichever piece of documentation you were following, and collapse to
// one source of truth before the schema runs.
//
// Also note: EMAIL_FROM intentionally has NO default. It used to default to
// 'no-reply@unmute.local', which made the `if (!env.EMAIL_FROM) throw` guards
// in emailService dead code — the value was never empty, so a misconfigured
// deployment silently sent from an undeliverable sender. For Gmail we default
// it to the authenticated account (that is the only address Gmail will allow),
// but "unset" must remain distinguishable from "set to something wrong".
const raw = { ...process.env };
if (!raw.SMTP_USER && raw.GMAIL_USER) raw.SMTP_USER = raw.GMAIL_USER;
if (!raw.SMTP_PASS && raw.GMAIL_APP_PASSWORD) raw.SMTP_PASS = raw.GMAIL_APP_PASSWORD;
if (raw.SMTP_USER) {
  if (!raw.SMTP_HOST) raw.SMTP_HOST = 'smtp.gmail.com';
  if (!raw.SMTP_PORT) raw.SMTP_PORT = '587';
  if (!raw.EMAIL_FROM) raw.EMAIL_FROM = raw.SMTP_USER;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().optional().default(''),

  EMAIL_FROM: z.string().optional().default(''),
  EMAIL_FROM_NAME: z.string().optional().default('unmute'),

  // Gmail over SMTP is the only real transport.
  //
  // The default is deliberately NOT "stub". Defaulting to stub is exactly what
  // let a production deploy run for who-knows-how-long printing verification
  // emails to the log and discarding them, while /register returned 201 and
  // users "never received" their link. Default to the real thing and fail at
  // boot if its credentials are missing.
  //
  // Resend and SendGrid were both removed. SendGrid retired its free tier;
  // Resend's free tier can only send from onboarding@resend.dev, which
  // delivers to the account owner's inbox and nobody else — so it could not
  // send from a real Gmail address.
  EMAIL_PROVIDER: z.enum(['smtp', 'stub']).default('smtp'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),

  FRONTEND_URL: z.string().default('http://localhost:5173'),

  PHONEPE_MERCHANT_ID: z.string().optional().default(''),
  PHONEPE_SALT_KEY: z.string().optional().default(''),
  PHONEPE_SALT_INDEX: z.coerce.number().int().default(1),
  PHONEPE_HOST: z.string().optional().default(''),

  AGORA_APP_ID: z.string().optional().default(''),
  AGORA_APP_CERTIFICATE: z.string().optional().default(''),
})
  // Cross-field email validation. The old setup let a server boot with a
  // placeholder sender and no credentials, then fail silently on every send.
  // Fail at boot instead: a misconfigured mailer should never reach production
  // pretending to be healthy.
  .superRefine((val, ctx) => {
    const need = (cond, key, msg) => {
      if (!cond) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: msg,
      });
    };

    if (val.EMAIL_PROVIDER === 'stub') return;

    need(!val.SMTP_USER, 'SMTP_USER', 'SMTP_USER is required when EMAIL_PROVIDER=smtp (your Gmail address)');
    need(!val.SMTP_HOST, 'SMTP_HOST', 'SMTP_HOST is required when EMAIL_PROVIDER=smtp');
    need(val.SMTP_PORT == null, 'SMTP_PORT', 'SMTP_PORT is required when EMAIL_PROVIDER=smtp');
    need(
      !val.SMTP_PASS,
      'SMTP_PASS',
      'SMTP_PASS is required when EMAIL_PROVIDER=smtp. Use a 16-character Google App Password (spaces removed), NOT your Gmail account password — Google rejects the latter.'
    );

    if (val.EMAIL_FROM) {
      need(
        !val.EMAIL_FROM.includes('@'),
        'EMAIL_FROM',
        `EMAIL_FROM must be a sender email address (got "${val.EMAIL_FROM}")`
      );
      // Gmail rewrites the From header to the authenticated account unless the
      // address matches, so a mismatch is a silent surprise worth refusing.
      if (val.SMTP_USER && val.EMAIL_FROM.toLowerCase() !== val.SMTP_USER.toLowerCase()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_FROM'],
          message:
            `EMAIL_FROM (${val.EMAIL_FROM}) must match SMTP_USER (${val.SMTP_USER}). ` +
            'Gmail will silently rewrite the From address otherwise, so mail would arrive looking like it came from somewhere else.',
        });
      }
    }
  });

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  // eslint-disable-next-line no-console
  console.error(
    '\nFor Gmail, create a 16-character App Password at ' +
    'https://myaccount.google.com/apppasswords (requires 2-Step Verification), ' +
    'then set SMTP_USER and SMTP_PASS in your host\'s environment.'
  );
  process.exit(1);
}

module.exports = parsed.data;

// --- Email delivery self-check ---------------------------------------------
//
// The single most confusing production bug in this codebase: the server was
// deployed with EMAIL_PROVIDER=stub, every verification email was printed to
// the log and thrown away, /register still returned 201, and users simply
// "never got" their link. There was no error anywhere to grep for.
//
// So shout about it at boot, and name the exact variables to set.
if (module.exports.EMAIL_PROVIDER === 'stub') {
  /* eslint-disable no-console */
  console.warn(
    [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║  EMAIL DELIVERY IS DISABLED (EMAIL_PROVIDER=stub)            ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '  Verification and password-reset emails are NOT being sent.',
      '  They are printed to this log and discarded.',
      '',
      '  To fix, set these in your host\'s environment and redeploy:',
      '    SMTP_USER = your Gmail address',
      '    SMTP_PASS = a 16-char Google App Password (no spaces)',
      '',
      '  SMTP_HOST and SMTP_PORT default to smtp.gmail.com:587 for you,',
      '  and EMAIL_FROM defaults to SMTP_USER. Keep EMAIL_PROVIDER=stub',
      '  only for local dev.',
      '',
    ].join('\n')
  );
  /* eslint-enable no-console */
} else {
  /* eslint-disable no-console */
  console.log(
    `[email] provider=smtp host=${module.exports.SMTP_HOST}:${module.exports.SMTP_PORT} ` +
    `from="${module.exports.EMAIL_FROM_NAME} <${module.exports.EMAIL_FROM}>" ` +
    `as=${module.exports.SMTP_USER}`
  );
  // Gmail silently rewrites the From header to the authenticated account, so
  // warn loudly rather than let mail arrive looking like it came from elsewhere.
  if (module.exports.EMAIL_FROM.toLowerCase() !== module.exports.SMTP_USER.toLowerCase()) {
    console.warn(
      `[email] WARNING: EMAIL_FROM (${module.exports.EMAIL_FROM}) differs from SMTP_USER ` +
      `(${module.exports.SMTP_USER}). Gmail will likely rewrite the sender.`
    );
  }
  /* eslint-enable no-console */
}
