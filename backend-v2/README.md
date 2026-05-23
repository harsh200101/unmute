# unmute backend v2

Phase 0 scaffold. See `../docs/v2-spec.md` for the full design.

## Prerequisites

- Node.js 20+
- Postgres 15+ running locally (or a connection string in `.env`)

## First-time setup

```bash
# 1. Install deps
cd backend-v2
npm install

# 2. Configure env
cp .env.example .env
# Edit .env: JWT_SECRET (any long random string), and DATABASE_URL if needed.

# 3. Create the database (one-time)
psql -U postgres -c "CREATE DATABASE unmute_v2"

# 4. Apply schema + seed
npm run migrate
npm run seed

# 5. Boot the server
npm run dev
# → http://localhost:5001/healthz
# → http://localhost:5001/readyz   (verifies DB connectivity)
```

Or use the convenience script at the repo root:

```bash
../scripts/setup-v2-db.sh
```

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Boot server with nodemon |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:status` | Show applied vs pending migrations |
| `CONFIRM=yes npm run db:reset` | Drop schema, re-migrate, re-seed (dev only) |
| `npm run seed` | Re-run idempotent seed |
| `npm test` | Jest test suite |

## Layout

```
src/
├── server.js            # express boot (phase 0: only /healthz, /readyz)
├── config/
│   ├── env.js           # zod-validated env loader
│   └── db.js            # pg pool + withTransaction()
├── migrator.js          # tracked migration runner
├── seed.js              # idempotent seed
└── migrations/
    └── 001_init.sql     # full v2 schema
```

Phase 1+ will add `middleware/`, `routes/`, `controllers/`, `services/`, `jobs/`, and `tests/`.

## What's in this scaffold

- ✅ Tracked migrator (`schema_migrations` table, checksum verification, transactional)
- ✅ Full v2 schema applied as a single migration
- ✅ Seed: 4 pricing tiers, 18 starter tags, platform wallet
- ✅ Env validation at boot (server refuses to start on bad config)
- ✅ Healthcheck + DB readiness probe

## What's NOT in this scaffold

Everything in phases 1-13 of the spec. Auth, mentors, bookings, billing, payments — none of it yet. `/api/*` returns 501. That's deliberate; we build one phase at a time.
