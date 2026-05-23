# unmute v2 — Production Setup

This is the checklist to take v2 from "all green locally" to "live in production". Every backend/frontend feature is built; what's left is **filling in secrets** and **picking a host**.

---

## Status at a glance

| Concern | State |
|---|---|
| PhonePe sandbox | ✅ Wired (defaults in `.env.example`) |
| PhonePe **production** | ⏳ Need merchant credentials |
| Agora | ⏳ Need App ID + Certificate |
| Google OAuth | ⏳ Optional — leave empty to disable |
| Email provider | ⏳ Currently in `stub` (logs to console) |
| Avatar storage | ⏳ Not yet built (deferred from spec §8) |
| Hosting | ⏳ Pick a provider |
| `JWT_SECRET` | ✅ Set locally; generate fresh for prod |

---

## 1. PhonePe

**Local dev:** already set in `backend-v2/.env.example` — uses PhonePe's public UAT sandbox (`PGTESTPAYUAT86`). Top-ups work end-to-end via `/dev/phonepe-stub`.

**Production:** From your PhonePe merchant dashboard, copy the 3 values into your prod env:

```
PHONEPE_MERCHANT_ID=<your_merchant_id>
PHONEPE_SALT_KEY=<your_salt_key>
PHONEPE_SALT_INDEX=<usually 1>
PHONEPE_HOST=https://api.phonepe.com/apis/hermes
```

The v1 deploy uses the same merchant ID style on Render — pull from there if you've already onboarded.

---

## 2. Agora

Get from https://console.agora.io → your project:

```
AGORA_APP_ID=<32-char hex>
AGORA_APP_CERTIFICATE=<32-char hex>
```

You can reuse the v1 Agora project (same App ID) or create a new one to keep v2 metrics clean.

Without these, `backend-v2` falls back to **stub mode** — credentials endpoint returns a fake token, the frontend recognizes it (`stub-...` prefix) and shows the call UI without attempting a real Agora connection. Useful for backend testing, useless for real users.

---

## 3. Email

Currently set to `EMAIL_PROVIDER=stub` — every sent email is logged to the server console. Verification + password-reset links appear there, copy-paste to test the flows.

**Pick a provider:**

| Provider | Free tier | Setup time | Best for |
|---|---|---|---|
| **Resend** (recommended) | 3k/month | 5 min | Simplest API, modern |
| **SES** | 62k/month (from EC2) | 30 min | AWS-native, cheap at scale |
| **Mailgun** | 100/day | 15 min | EU residency |
| **SMTP (Gmail)** | very limited | 10 min | Personal projects only |

Plumbing point: `backend-v2/src/services/emailService.js` already has a provider switch. Adding Resend = ~10 lines:

```js
} else if (env.EMAIL_PROVIDER === 'resend') {
  const { Resend } = require('resend');
  const resend = new Resend(env.RESEND_API_KEY);
  const r = await resend.emails.send({
    from: env.EMAIL_FROM, to, subject, text, html, attachments,
  });
  return { provider: 'resend', id: r.data.id };
}
```

Plus add to `.env`:
```
EMAIL_PROVIDER=resend
EMAIL_FROM=hello@yourdomain.com
RESEND_API_KEY=re_...
```

---

## 4. Google OAuth (optional)

If you want "Sign in with Google" to work:

1. https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth Client ID (Web)
2. Authorized redirect URI: `https://api.yourdomain.com/api/auth/google/callback`
3. Set:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/auth/google/callback
   ```

Leave empty to disable — the `/api/auth/google` endpoint will respond `400 google_not_configured`, and the frontend can hide the button.

Note: the full Google callback handler (code exchange + profile fetch) is feature-gated in `authService.googleConfigured()` but **not fully implemented** — phase 1.5 deferred. Most of the wiring is in place; needs an integration test before launching.

---

## 5. Avatar storage

Deferred from §8 of `v2-spec.md`. There's no `POST /api/me/avatar` endpoint yet. When you're ready:

- **Cloudflare R2** (recommended): S3-compatible, free egress, ~₹2/GB/month
- **AWS S3**: standard
- **Render Disk**: persistent disk attached to the backend, simplest if you're already on Render

For MVP, you can ship without avatars — frontend already falls back to letter-initials. Add later.

---

## 6. Hosting

The v1 deploy is on **Render** (`unmute-backend-4x1x.onrender.com`). Sticking with Render keeps the operational footprint single-vendor.

### Render setup for v2 backend

`backend-v2/render.yaml`:

```yaml
services:
  - type: web
    name: unmute-v2-backend
    runtime: node
    plan: starter
    region: singapore
    rootDir: backend-v2
    buildCommand: npm install
    startCommand: npm run migrate && npm start
    healthCheckPath: /readyz
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: unmute-v2-db
          property: connectionString
      - key: FRONTEND_URL
        value: https://app.unmute.com
      - key: JWT_SECRET
        generateValue: true
      # All others (Agora, Google, PhonePe, Email) → set in Render dashboard
databases:
  - name: unmute-v2-db
    region: singapore
    plan: starter
```

### Frontend deploy

Vite builds static. Easiest = a second Render Static Site, or Vercel / Cloudflare Pages.

Build command: `npm run build`
Publish directory: `dist`
Env: `VITE_API_URL=https://api.unmute.com`

---

## 7. The cutover (when ready)

Old DB stays running. New DB is `unmute_v2` on a fresh Postgres instance.

You chose "fresh start, no data migration" in Wave 1, so there's nothing to migrate from `unmute` → `unmute_v2`. Cutover is:

1. Deploy `backend-v2` to production at a new subdomain (e.g. `api-v2.unmute.com`).
2. Run `npm run migrate && npm run seed` once against the prod DB (creates schema + tiers + tags + platform wallet).
3. Set `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars before seed → admin user created. (Or run `seed` again after setting them.)
4. Deploy `frontend-v2` at the customer-facing URL (e.g. `app.unmute.com`).
5. Smoke-test: register → verify email → top up via PhonePe sandbox → list mentors.
6. Onboard a real mentor + admin-approve → end-to-end test a real call.
7. Switch DNS over.
8. After 7-14 days of stable v2, delete the v1 deploy and drop the old `unmute` DB.

---

## 8. Production checklist (final)

Copy this into a GitHub issue or wherever you track launch work.

- [ ] Pick & set up Render (or other host)
- [ ] Provision `unmute_v2` Postgres on host
- [ ] Set env vars on host:
  - [ ] `DATABASE_URL` (auto from Render)
  - [ ] `JWT_SECRET` (generate fresh)
  - [ ] `FRONTEND_URL` = your production frontend URL
  - [ ] `PHONEPE_MERCHANT_ID` / `PHONEPE_SALT_KEY` / `PHONEPE_HOST` (production values)
  - [ ] `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE`
  - [ ] `EMAIL_PROVIDER=resend` (or smtp) + provider credentials
  - [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (if enabling Google sign-in)
  - [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` (one-time, then remove)
- [ ] Run migrations on prod DB
- [ ] Run seed (tiers, tags, platform wallet, admin user)
- [ ] Deploy frontend-v2 with `VITE_API_URL=https://api.unmute.com`
- [ ] Set up Render auto-deploy from `v2` branch
- [ ] Smoke test all flows end-to-end
- [ ] Onboard real mentor, run real call, verify wallet movement
- [ ] Switch DNS to v2
- [ ] Monitor for 7-14 days
- [ ] Decommission v1
