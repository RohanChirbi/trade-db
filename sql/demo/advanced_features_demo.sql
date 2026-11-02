-- sql/demo/advanced_features_demo.sql : live demo of the advanced features (Phase 4).
-- Runs in ONE transaction and ends with ROLLBACK, so it can be repeated and leaves the data unchanged.
--   local:   sh scripts/psql.sh -f sql/demo/advanced_features_demo.sql
--   docker:  docker exec -i trading_postgres psql -U trading_admin -d trading_db < sql/demo/advanced_features_demo.sql
\set ON_ERROR_STOP on
\pset footer off
BEGIN;

\echo '=== 1. Stored function + transaction: submit_order() places a MARKET order and fills it at the latest quote'
SELECT * FROM submit_order(1, 'TCS.NS', 'BUY', 'MARKET', 100);
\echo '--- trigger effects: order status, the fill, and the position row created for today'
SELECT order_id, status, quantity FROM orders ORDER BY order_id DESC LIMIT 1;
SELECT execution_id, order_id, exec_qty, exec_price FROM execution ORDER BY execution_id DESC LIMIT 1;
SELECT * FROM position WHERE strategy_id = 1 AND ticker = 'TCS.NS' ORDER BY trade_date DESC LIMIT 2;

\echo '=== 2. Trigger: partial fill, over-fill rejection, cancel (UPDATE flow), fill after cancel rejected'
SELECT place_order(2, 'INFY.NS', 'BUY', 'LIMIT', 100, 1000.00) AS order_id \gset
SELECT record_execution(:order_id, 40, 1000.00);
SELECT order_id, status FROM orders WHERE order_id = :order_id;
DO $$ BEGIN
    PERFORM record_execution(currval(pg_get_serial_sequence('orders', 'order_id')), 100, 1000.00);
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;
DO $$ BEGIN
    PERFORM record_execution(currval(pg_get_serial_sequence('orders', 'order_id')), 10, 1001.00);
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;
SELECT cancel_order(:order_id);
SELECT order_id, status FROM orders WHERE order_id = :order_id;
SELECT event_type, event_ts FROM order_event WHERE order_id = :order_id ORDER BY event_id;
DO $$ BEGIN
    PERFORM record_execution(currval(pg_get_serial_sequence('orders', 'order_id')), 10, 1000.00);
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;

\echo '=== 3. Atomicity: a failing order leaves nothing behind (pre-trade risk check fails)'
SELECT count(*) AS orders_before FROM orders \gset
DO $$ BEGIN
    PERFORM submit_order(3, 'RELIANCE.NS', 'BUY', 'MARKET', 1000000);
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;
SELECT :orders_before AS orders_before, count(*) AS orders_after FROM orders;

\echo '=== 4. Constraint checks reject bad data'
DO $$ BEGIN
    INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, submitted_ts) VALUES (1, 'TCS.NS', 'BUY', 'LIMIT', 10, now());
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;
DO $$ BEGIN
    INSERT INTO market_quote (ticker, quote_ts, bid_price, bid_qty, ask_price, ask_qty, last_price) VALUES ('TCS.NS', now(), 101, 1, 100, 1, 100);
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;

\echo '=== 5. Correction flow (UPDATE): fix a mis-booked fill price, returns the old price'
SELECT execution_id AS fix_id FROM execution ORDER BY execution_id DESC LIMIT 1 \gset
SELECT correct_execution(:fix_id, 999.95) AS old_price;
SELECT execution_id, exec_price AS new_price FROM execution WHERE execution_id = :fix_id;

\echo '=== 6. DELETE flow: a cancelled order with no fills can be deleted (its events cascade);'
\echo '===    an order with fills cannot (execution FK is RESTRICT)'
SELECT place_order(4, 'HDFCBANK.NS', 'SELL', 'LIMIT', 50, 5000.00) AS del_id \gset
SELECT cancel_order(:del_id);
DELETE FROM orders WHERE order_id = :del_id;
SELECT count(*) AS events_left_for_deleted_order FROM order_event WHERE order_id = :del_id;
DO $$ BEGIN
    DELETE FROM orders WHERE order_id = (SELECT order_id FROM execution ORDER BY execution_id LIMIT 1);
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'REJECTED as expected: %', SQLERRM; END $$;

\echo '=== 7. View: StrategyPerformance for the latest day'
SELECT strategy_id, trade_date, trading_volume, round(realised_pnl, 2) AS realised_pnl, return_on_capital
FROM StrategyPerformance WHERE trade_date = '2025-12-30' ORDER BY strategy_id;

\echo '=== 8. Indexing: Q9 (latest quote at a time) WITHOUT and WITH idx_quote_ticker_ts'
DROP INDEX idx_quote_ticker_ts;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON)
SELECT s.ticker, q.* FROM security s CROSS JOIN LATERAL (
    SELECT quote_ts, bid_price, ask_price FROM market_quote m
    WHERE m.ticker = s.ticker AND m.quote_ts <= '2025-06-02 11:00+05:30' ORDER BY m.quote_ts DESC LIMIT 1) q;
CREATE UNIQUE INDEX idx_quote_ticker_ts ON market_quote (ticker, quote_ts);
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON)
SELECT s.ticker, q.* FROM security s CROSS JOIN LATERAL (
    SELECT quote_ts, bid_price, ask_price FROM market_quote m
    WHERE m.ticker = s.ticker AND m.quote_ts <= '2025-06-02 11:00+05:30' ORDER BY m.quote_ts DESC LIMIT 1) q;

ROLLBACK;
\echo '=== demo finished; everything above was rolled back'
