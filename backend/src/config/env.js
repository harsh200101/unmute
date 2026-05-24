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

  EMAIL_FROM: z.string().default('no-reply@unmute.local'),
  EMAIL_FROM_NAME: z.string().optional().default('unmute'),
  EMAIL_PROVIDER: z.enum(['stub', 'resend', 'smtp', 'sendgrid']).default('stub'),
  RESEND_API_KEY: z.string().optional().default(''),
  SENDGRID_API_KEY: z.string().optional().default(''),
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
