'use strict';

require('dotenv').config();
const { z } = require('zod');

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

  // NOTE: no default for EMAIL_FROM on purpose. It used to default to
  // 'no-reply@unmute.local', which made `if (!env.EMAIL_FROM) throw` inside
  // emailService dead code — the value was never empty, so a misconfigured
  // deployment silently sent from an undeliverable domain and the provider
  // rejected it with a 403 that nobody saw. Empty is now the only "unset".
  EMAIL_FROM: z.string().optional().default(''),
  EMAIL_FROM_NAME: z.string().optional().default('unmute'),

  // Resend is the only real provider. It was chosen over SendGrid because
  // SendGrid retired its free tier, and over raw SMTP because Render blocks
  // outbound SMTP on free tiers. See services/emailService.js.
  //
  // The default is deliberately NOT "stub". Defaulting to stub is exactly what
  // let a production deploy run for who-knows-how-long printing verification
  // emails to the log and discarding them, while /register returned 201 and
  // users "never received" their link. Default to the real thing and fail at
  // boot if its credentials are missing.
  EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'stub']).default('resend'),
  RESEND_API_KEY: z.string().optional().default(''),
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
  // Cross-field email validation. The old setup let a server boot with
  // EMAIL_PROVIDER=resend and an empty RESEND_API_KEY, then fail silently on
  // every send. Fail at boot instead: a misconfigured mailer should never
  // reach production pretending to be healthy.
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

    need(
      !val.EMAIL_FROM,
      'EMAIL_FROM',
      'EMAIL_FROM is required when EMAIL_PROVIDER is not "stub" (it must be a sender address/domain your email provider has verified)'
    );
    // Only complain about the format once we know a value was supplied,
    // otherwise a single missing var reports two different errors.
    if (val.EMAIL_FROM) {
      need(
        !val.EMAIL_FROM.includes('@'),
        'EMAIL_FROM',
        `EMAIL_FROM must be a sender email address (got "${val.EMAIL_FROM}")`
      );
    }

    if (val.EMAIL_PROVIDER === 'resend') {
      need(!val.RESEND_API_KEY, 'RESEND_API_KEY', 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    }
    if (val.EMAIL_PROVIDER === 'smtp') {
      need(!val.SMTP_HOST, 'SMTP_HOST', 'SMTP_HOST is required when EMAIL_PROVIDER=smtp');
      need(val.SMTP_PORT == null, 'SMTP_PORT', 'SMTP_PORT is required when EMAIL_PROVIDER=smtp');
      need(!val.SMTP_USER, 'SMTP_USER', 'SMTP_USER is required when EMAIL_PROVIDER=smtp');
      need(!val.SMTP_PASS, 'SMTP_PASS', 'SMTP_PASS is required when EMAIL_PROVIDER=smtp (use a Google App Password, not your account password)');
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
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
// So shout about it at boot, and name the exact variable to change.
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
      '    RESEND_API_KEY = re_...   (from https://resend.com → API Keys)',
      '    EMAIL_FROM     = a sender address Resend has verified',
      '',
      '  EMAIL_PROVIDER defaults to "resend", so setting only the two vars',
      '  above is enough. Keep EMAIL_PROVIDER=stub only for local dev.',
      '',
    ].join('\n')
  );
  /* eslint-enable no-console */
} else {
  /* eslint-disable no-console */
  console.log(
    `[email] provider=${module.exports.EMAIL_PROVIDER} from=${module.exports.EMAIL_FROM || '(none)'}`
  );
  /* eslint-enable no-console */
}
