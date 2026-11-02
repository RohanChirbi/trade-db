#!/bin/sh
# scripts/psql.sh : psql as the admin user against the local database from scripts/local.sh
# Usage: sh scripts/psql.sh [psql args]   e.g.  sh scripts/psql.sh -f sql/demo/advanced_features_demo.sql
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
PATH=$(brew --prefix postgresql@17)/bin:$PATH \
PGPASSWORD=$POSTGRES_PASSWORD exec psql -X -h 127.0.0.1 -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
