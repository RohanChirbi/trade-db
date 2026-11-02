#!/bin/sh
# ingestion/load_data.sh : loads data/generated/*.csv into Postgres in ONE transaction (all tables
# or none), resets the ID sequences, re-seeds the demo users and runs the sanity checks.
# Usage (from anywhere):  sh ingestion/load_data.sh
set -e
. "$(dirname "$0")/lib.sh"

TABLES="security strategy market_quote orders order_event execution position risk_metric"
for t in $TABLES; do
  [ -f "data/generated/$t.csv" ] || { echo "data/generated/$t.csv missing - run python3 ingestion/generate_data.py" >&2; exit 1; }
done

{
  echo 'BEGIN;'
  # CASCADE also empties app_user (it references strategy), so the users are re-seeded below
  echo 'TRUNCATE risk_metric, position, execution, order_event, orders, market_quote, security, strategy, app_user RESTART IDENTITY CASCADE;'
  # historical fills already carry their final order status and positions, so skip the triggers
  echo 'ALTER TABLE execution DISABLE TRIGGER USER;'
  for t in $TABLES; do
    printf '\\echo loading %s\n' "$t"
    # column list taken from the CSV header, so column order in the file does not matter
    printf 'COPY %s (%s) FROM STDIN WITH (FORMAT csv, HEADER true);\n' "$t" "$(head -n 1 "data/generated/$t.csv")"
    cat "data/generated/$t.csv"
    printf '\\.\n'
  done
  # the CSVs supply explicit IDs, so move each identity sequence past the loaded maximum
  printf '\\o /dev/null\n'
  for s in strategy:strategy_id market_quote:quote_id orders:order_id order_event:event_id execution:execution_id; do
    tbl=${s%%:*}; col=${s#*:}
    printf "SELECT setval(pg_get_serial_sequence('%s', '%s'), coalesce(max(%s), 0) + 1, false) FROM %s;\n" "$tbl" "$col" "$col" "$tbl"
  done
  printf '\\o\n'
  echo 'ALTER TABLE execution ENABLE TRIGGER USER;'
  echo 'COMMIT;'
} | psql_admin

sh ingestion/seed_users.sh
psql_admin < ingestion/sanity_checks.sql
