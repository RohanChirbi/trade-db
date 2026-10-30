#!/bin/sh
set -e
PSQL='psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
docker compose exec -T postgres sh -c "$PSQL -c 'TRUNCATE risk_metric, position, execution, order_event, orders, market_quote, security, strategy, app_user RESTART IDENTITY CASCADE'"
for t in security strategy market_quote orders order_event execution position risk_metric; do
  echo "Loading $t"
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "\copy '"$t"' FROM STDIN WITH (FORMAT csv, HEADER true)"' < data/generated/$t.csv
done
docker compose exec -T postgres sh -c "$PSQL" <<'SQL'
SELECT setval(pg_get_serial_sequence('strategy','strategy_id'),         (SELECT max(strategy_id) FROM strategy));
SELECT setval(pg_get_serial_sequence('market_quote','quote_id'),        (SELECT max(quote_id) FROM market_quote));
SELECT setval(pg_get_serial_sequence('orders','order_id'),              (SELECT max(order_id) FROM orders));
SELECT setval(pg_get_serial_sequence('order_event','event_id'),         (SELECT max(event_id) FROM order_event));
SELECT setval(pg_get_serial_sequence('execution','execution_id'),       (SELECT max(execution_id) FROM execution));
SQL
