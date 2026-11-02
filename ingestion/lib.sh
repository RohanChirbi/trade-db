# ingestion/lib.sh : shared setup for the shell scripts in this folder (sourced, not run).
# Moves to the repo root, loads .env.local and defines psql_admin.

cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found - copy .env.example to .env.local and fill it in" >&2; exit 1; }
set -a; . ./.env.local; set +a

# psql as the admin user, inside the postgres container by default.
# Set PSQL_URL (e.g. postgresql://user:pw@localhost:5432/db) to use a local psql instead.
psql_admin() {
  if [ -n "$PSQL_URL" ]; then
    psql "$PSQL_URL" -X -q -v ON_ERROR_STOP=1 "$@"
  else
    docker compose --env-file .env.local exec -T \
      -e SEED_TRADER_PASSWORD="$SEED_TRADER_PASSWORD" -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
      postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -q -v ON_ERROR_STOP=1 "$@"' sh "$@"
  fi
}
