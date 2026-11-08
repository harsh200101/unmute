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

  // Gmail only permits the From header to be the authenticated account (or an
  // alias it knows), and silently rewrites anything else. A stale EMAIL_FROM
  // left over from a previous provider therefore cannot be honoured, and
  // crashing the whole deploy over a display-string field is the wrong trade:
  // adopt the authenticated address so mail still sends from a real account.
  // `__EMAIL_FROM_MISMATCH__` is reported at boot rather than silently swallowed.
  if (raw.EMAIL_FROM && raw.EMAIL_FROM.toLowerCase() !== raw.SMTP_USER.toLowerCase()) {
    raw.__EMAIL_FROM_MISMATCH__ = raw.EMAIL_FROM;
    raw.EMAIL_FROM = raw.SMTP_USER;
  }

  // Google displays App Passwords in groups of four ("abcd efgh ijkl mnop"), and
  // copy-pasting from that page frequently carries the spaces into a dashboard
  // value. Gmail then rejects an otherwise-valid password with
  // "535-5.7.8 Username and Password not accepted", which is indistinguishable
  // from a genuinely wrong password in the response. Strip them here so the
  // pasted form and the bare form behave identically.
  if (raw.SMTP_PASS && /\s/.test(raw.SMTP_PASS)) {
    const stripped = raw.SMTP_PASS.replace(/\s+/g, '');
    raw.__SMTP_PASS_HAD_WHITESPACE__ = true;
    raw.SMTP_PASS = stripped;
  }
}

// --- PhonePe normalisation ---------------------------------------------------
//
// Older deployments used PHONEPE_BASE_URL for the API origin while the code
// reads PHONEPE_HOST. Accept the legacy name so a stale .env does not silently
// fall back to the stub provider (which is exactly what hid missing creds).
if (!raw.PHONEPE_HOST && raw.PHONEPE_BASE_URL) raw.PHONEPE_HOST = raw.PHONEPE_BASE_URL;

// Render injects RENDER_EXTERNAL_URL with the service's own public origin.
// Adopting it means the PhonePe webhook callback is correct even when
// API_PUBLIC_URL was forgotten in the dashboard.
if (!raw.API_PUBLIC_URL && raw.RENDER_EXTERNAL_URL) {
  raw.API_PUBLIC_URL = raw.RENDER_EXTERNAL_URL;
  raw.__API_PUBLIC_URL_DERIVED__ = true;
}

// PhonePe V2 uses different hosts per environment. Default them from
// PHONEPE_ENV (or NODE_ENV) so operators only set credentials, not URLs.
const phonepeEnv =
  (raw.PHONEPE_ENV || '').toLowerCase() ||
  (raw.NODE_ENV === 'production' ? 'production' : 'sandbox');
if (!raw.PHONEPE_ENV) raw.PHONEPE_ENV = phonepeEnv;
if (!raw.PHONEPE_AUTH_HOST) {
  raw.PHONEPE_AUTH_HOST =
    phonepeEnv === 'production'
      ? 'https://api.phonepe.com/apis/identity-manager'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}
if (!raw.PHONEPE_API_HOST) {
  raw.PHONEPE_API_HOST =
    phonepeEnv === 'production'
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),

  // How long an uncompleted checkout is treated as abandoned by the status
  // endpoint. PhonePe's own timer is ~15 min, so the default must stay above
  // that or we would report 'expired' while PhonePe still accepts payment.
  // Overridable so the expiry path can be verified in minutes rather than by
  // sitting on a checkout page for a quarter of an hour.
  CHECKOUT_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

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
  // Accept legacy values from stale dashboards instead of crash-looping the
  // deploy. Both removed providers are mapped to smtp, which is what the
  // operator actually wants; `__LEGACY_PROVIDER__` makes env.js warn at boot
  // so the dashboard still gets fixed. Mapping beats a hard enum failure here
  // because the alternative is a deploy that cannot start at all.
  EMAIL_PROVIDER: z
    .string()
    .optional()
    .transform((v) => {
      const val = (v || 'smtp').toLowerCase();
      if (val === 'sendgrid' || val === 'resend' || val === 'ses' || val === 'mailgun') {
        raw.__LEGACY_PROVIDER__ = v;
        return 'smtp';
      }
      return val;
    })
    .pipe(z.enum(['smtp', 'stub'])),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),

  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Public origin of THIS backend, used to build the PhonePe webhook callback.
  // It cannot be derived from FRONTEND_URL: the previous code assumed an
  // `api.` subdomain and produced https://api.unmute-frontend.onrender.com,
  // which resolves nowhere, so no webhook was ever delivered and no payment
  // could settle. Set it to the backend's own deployed origin.
  API_PUBLIC_URL: z.string().optional().default(''),

  // Which gateway drives wallet top-ups. This single variable is the one-click
  // switch between providers; BOTH remain implemented and configured.
  //   phonepe  — PhonePe PG (the original integration, still fully wired)
  //   razorpay — Razorpay Standard Checkout
  // Changing it flips the flow with no code change. Defaults to phonepe so
  // existing behaviour (and the test suite) is unchanged until it is set.
  PAYMENT_GATEWAY: z.enum(['phonepe', 'razorpay']).default('phonepe'),

  // --- PhonePe ---
  // V2 (current) uses OAuth client credentials + checkout APIs. V1 (legacy)
  // uses merchant id + salt key. V2 wins when both are present.
  PHONEPE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PHONEPE_CLIENT_ID: z.string().optional().default(''),
  PHONEPE_CLIENT_SECRET: z.string().optional().default(''),
  PHONEPE_CLIENT_VERSION: z.string().optional().default(''),
  PHONEPE_AUTH_HOST: z.string().optional().default(''),
  PHONEPE_API_HOST: z.string().optional().default(''),

  // Webhook authentication. PhonePe offers SHA256(username:password) via the
  // Authorization header, or HMAC-SHA256 of the raw payload. Pick the one
  // configured in the PhonePe dashboard. Unset webhook credentials fail closed.
  PHONEPE_WEBHOOK_AUTH: z.enum(['sha', 'hmac']).default('sha'),
  PHONEPE_WEBHOOK_USERNAME: z.string().optional().default(''),
  PHONEPE_WEBHOOK_PASSWORD: z.string().optional().default(''),
  PHONEPE_WEBHOOK_SECRET: z.string().optional().default(''),

  // Local dev escape hatch. Production / staging must NEVER stub a payment:
  // a fake success is money the user believes they topped up. Only local dev
  // can opt in, and the test suite always stubs for determinism.
  PHONEPE_ALLOW_STUB: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // How long PhonePe keeps the checkout page open, in seconds. Mirrors the
  // `expireAfter` field on the V2 create-payment call.
  PHONEPE_EXPIRE_AFTER_SECONDS: z.coerce.number().int().min(300).max(3600).default(1200),

  PHONEPE_MERCHANT_ID: z.string().optional().default(''),
  PHONEPE_SALT_KEY: z.string().optional().default(''),
  PHONEPE_SALT_INDEX: z.coerce.number().int().default(1),
  PHONEPE_HOST: z.string().optional().default(''),

  // --- Razorpay ---
  // KEY_SECRET is server-side only and must NEVER appear in frontend code.
  // The frontend only ever receives KEY_ID (returned by the create-order
  // response) so it can open the Checkout modal.
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),

  AGORA_APP_ID: z.string().optional().default(''),
  AGORA_APP_CERTIFICATE: z.string().optional().default(''),

  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional().default(''),
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
  // The operator's most common mistake is editing a local .env and expecting
  // the host to use it. Render injects dashboard variables and there is no .env
  // in the container, so name the actual source of truth.
  console.error(
    '\nNote: on Render these must be set in Dashboard -> your service -> Environment. ' +
    'A local .env file is NOT read by the deployed container.'
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
    `as=${module.exports.SMTP_USER} ` +
    `pass_len=${module.exports.SMTP_PASS.length}`
  );
  // Never print the password itself, but the length is the single most useful
  // signal: a Google App Password is always exactly 16 characters, so anything
  // else is an account password or a truncated paste.
  if (module.exports.SMTP_PASS && module.exports.SMTP_PASS.length !== 16) {
    console.warn(
      `[email] WARNING: SMTP_PASS is ${module.exports.SMTP_PASS.length} characters. ` +
      'A Google App Password is always 16. Gmail will reject this with ' +
      '"535-5.7.8 Username and Password not accepted".'
    );
  }
  if (raw.__SMTP_PASS_HAD_WHITESPACE__) {
    // Never mutate a secret without saying so.
    console.warn(
      '[email] NOTE: SMTP_PASS contained whitespace and was stripped. ' +
      'Google displays app passwords in groups of four, so a copy-paste often ' +
      'includes spaces. Store it without them to silence this.'
    );
  }
  // A legacy value was silently remapped to smtp above. Say so, so the stale
  // dashboard entry gets cleaned up rather than lingering indefinitely.
  if (raw.__LEGACY_PROVIDER__) {
    console.warn(
      `[email] NOTE: EMAIL_PROVIDER was "${raw.__LEGACY_PROVIDER__}", which no longer exists. ` +
      'It has been mapped to "smtp". Update this variable in your host\'s environment to smtp.'
    );
  }
  // Report the substitution rather than swallowing it: the operator asked for
  // one sender and is getting another, and needs to know which one is real.
  if (raw.__EMAIL_FROM_MISMATCH__) {
    console.warn(
      `[email] NOTE: EMAIL_FROM was set to ${raw.__EMAIL_FROM_MISMATCH__} but SMTP_USER ` +
      `is ${module.exports.SMTP_USER}. Gmail only sends as the authenticated account, so the ` +
      `sender is now ${module.exports.EMAIL_FROM}. To send as ${raw.__EMAIL_FROM_MISMATCH__}, ` +
      'authenticate as that address instead (set SMTP_USER and SMTP_PASS to its app password).'
    );
  }
  /* eslint-enable no-console */
}

// --- PhonePe self-check -----------------------------------------------------
//
// A production deploy must not run the stub provider: it shows a fake checkout
// success and credits no money. Say so at boot (and again if a top-up is
// attempted) instead of failing silently.
const _phonepeV2 = Boolean(
  module.exports.PHONEPE_CLIENT_ID &&
  module.exports.PHONEPE_CLIENT_SECRET &&
  module.exports.PHONEPE_CLIENT_VERSION
);
const _phonepeV1 = Boolean(
  module.exports.PHONEPE_MERCHANT_ID &&
  module.exports.PHONEPE_SALT_KEY &&
  module.exports.PHONEPE_HOST
);
if (module.exports.PAYMENT_GATEWAY === 'phonepe') {
  if (module.exports.NODE_ENV === 'production' && !_phonepeV2 && !_phonepeV1) {
    /* eslint-disable no-console */
    console.warn(
      [
        '',
        'PHONEPE IS NOT CONFIGURED - TOP-UPS WILL FAIL',
        '  Set PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET and',
        '  PHONEPE_CLIENT_VERSION (V2), or the legacy PHONEPE_MERCHANT_ID,',
        '  PHONEPE_SALT_KEY and PHONEPE_HOST (V1), in the host environment.',
        '  Also set API_PUBLIC_URL to this backend\'s public origin so',
        '  PhonePe can deliver the webhook.',
        '',
      ].join('\n')
    );
    /* eslint-enable no-console */
  } else if (_phonepeV2 || _phonepeV1) {
    // eslint-disable-next-line no-console
    console.log(
      `[payments] PhonePe ${_phonepeV2 ? 'V2' : 'V1'} enabled (${module.exports.PHONEPE_ENV}), ` +
      `webhook auth=${module.exports.PHONEPE_WEBHOOK_AUTH}`
    );
  }
  if (module.exports.NODE_ENV === 'production' && !module.exports.API_PUBLIC_URL) {
    // eslint-disable-next-line no-console
    console.warn(
      '[payments] API_PUBLIC_URL is empty. PhonePe cannot deliver webhooks without it.'
    );
  }
  if (module.exports.PHONEPE_ALLOW_STUB && module.exports.NODE_ENV !== 'development') {
    // eslint-disable-next-line no-console
    console.warn(
      `[payments] WARNING: PHONEPE_ALLOW_STUB=true in NODE_ENV=${module.exports.NODE_ENV}. ` +
      'Top-ups will use the fake stub provider.'
    );
  }
}
if (raw.__API_PUBLIC_URL_DERIVED__) {
  // eslint-disable-next-line no-console
  console.log(`[payments] API_PUBLIC_URL derived from RENDER_EXTERNAL_URL: ${module.exports.API_PUBLIC_URL}`);
}
