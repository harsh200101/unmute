#!/usr/bin/env bash
# scripts/setup-v2-db.sh
# Convenience: create the v2 Postgres database, apply migrations, seed.
#
# Re-runnable. If DB exists, leaves it alone. Migrate + seed are idempotent.
#
# Usage:
#   ./scripts/setup-v2-db.sh
#   PG_USER=postgres PG_HOST=localhost ./scripts/setup-v2-db.sh

set -euo pipefail

# On Homebrew Postgres the default superuser is the macOS username, not 'postgres'.
# Detect by probing both; fall back to PG_USER if explicitly set.
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
DB_NAME="${DB_NAME:-unmute_v2}"
if [ -z "${PG_USER:-}" ]; then
  if psql -h "$PG_HOST" -p "$PG_PORT" -U postgres -d postgres -c '\q' >/dev/null 2>&1; then
    PG_USER=postgres
  elif psql -h "$PG_HOST" -p "$PG_PORT" -U "$(whoami)" -d postgres -c '\q' >/dev/null 2>&1; then
    PG_USER="$(whoami)"
  else
    PG_USER=postgres  # will fail below with a clear message
  fi
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend-v2"

echo "→ Checking Postgres at $PG_USER@$PG_HOST:$PG_PORT"
if ! psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c '\q' >/dev/null 2>&1; then
  echo "✗ Cannot connect to Postgres. Check it's running and PG_USER/PG_HOST/PG_PORT are correct."
  exit 1
fi

echo "→ Ensuring database $DB_NAME exists"
EXISTS=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
if [ "$EXISTS" != "1" ]; then
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
  echo "  ✓ created"
else
  echo "  ✓ already exists"
fi

cd "$BACKEND_DIR"

if [ ! -f ".env" ]; then
  echo "→ Creating backend-v2/.env from .env.example"
  cp .env.example .env
  # Generate a random JWT_SECRET so the server can boot
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  # Build DATABASE_URL from PG_USER/PG_HOST/PG_PORT/DB_NAME so the env matches
  # the user we just verified can connect.
  DB_URL="postgres://$PG_USER@$PG_HOST:$PG_PORT/$DB_NAME"
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
  else
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
  fi
fi

if [ ! -d "node_modules" ]; then
  echo "→ Installing backend-v2 dependencies"
  npm install
fi

echo "→ Applying migrations"
npm run --silent migrate

echo "→ Seeding"
npm run --silent seed

echo ""
echo "✓ unmute_v2 database is ready."
echo "  Start the backend:  cd backend-v2 && npm run dev"
echo "  Start the frontend: cd frontend-v2 && npm install && npm run dev"
