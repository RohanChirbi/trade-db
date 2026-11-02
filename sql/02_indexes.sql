-- 02_indexes.sql : indexes beyond those created automatically for PKs and UNIQUE constraints

-- Latest quote before a given time (Q9) and spread queries (Q1, Q10).
-- Unique, so it also guarantees one quote per ticker per timestamp.
-- Named so it can be dropped and recreated for the EXPLAIN ANALYZE demo.
CREATE UNIQUE INDEX idx_quote_ticker_ts ON market_quote (ticker, quote_ts);

-- Per-strategy volume, large orders, spoofing (Q5, Q15, Q16)
CREATE INDEX idx_orders_strategy_ts ON orders (strategy_id, submitted_ts);
-- Per-security aggregates (Q6, Q7, Q15)
CREATE INDEX idx_orders_ticker      ON orders (ticker);

-- Fill totals (Q3, Q4) and time-window volume (Q17)
CREATE INDEX idx_exec_order ON execution (order_id);
CREATE INDEX idx_exec_ts    ON execution (exec_ts);

-- Cancellations within a time window (Q16, Q20); (order_id, event_type) is already indexed by its UNIQUE constraint
CREATE INDEX idx_event_type_ts ON order_event (event_type, event_ts);

-- P&L and exposure by strategy and date (Q8, Q13, Q14, Q18)
CREATE INDEX idx_position_strategy_date ON position (strategy_id, trade_date);

-- Looking up a strategy's trader users
CREATE INDEX idx_user_strategy ON app_user (strategy_id);