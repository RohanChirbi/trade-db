#!/bin/sh
# ingestion/seed_users.sh : creates the demo logins - trader<N> for each strategy N, plus "compliance".
# Passwords come from SEED_TRADER_PASSWORD / SEED_ADMIN_PASSWORD in .env.local and are stored as
# bcrypt hashes (pgcrypto, $2a$ format, verifiable with bcrypt/bcryptjs in the app). Safe to re-run.
set -e
. "$(dirname "$0")/lib.sh"
: "${SEED_TRADER_PASSWORD:?set SEED_TRADER_PASSWORD in .env.local}"
: "${SEED_ADMIN_PASSWORD:?set SEED_ADMIN_PASSWORD in .env.local}"

psql_admin <<'SQL'
\getenv trader_pw SEED_TRADER_PASSWORD
\getenv admin_pw SEED_ADMIN_PASSWORD
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO app_user (username, password_hash, role, strategy_id)
SELECT 'trader' || strategy_id, crypt(:'trader_pw', gen_salt('bf')), 'TRADER', strategy_id FROM strategy
UNION ALL
SELECT 'compliance', crypt(:'admin_pw', gen_salt('bf')), 'COMPLIANCE', NULL
ON CONFLICT (username) DO UPDATE
   SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, strategy_id = EXCLUDED.strategy_id;
\echo seeded users:
SELECT username, role, strategy_id FROM app_user ORDER BY user_id;
SQL
