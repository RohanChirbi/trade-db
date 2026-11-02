-- Q09: Latest quote for every security at a given time (LATERAL join)
-- The most recent quote at or before the as-of time. Uses idx_quote_ticker_ts; this is the EXPLAIN ANALYZE demo query.
WITH params AS (SELECT timestamptz '2025-06-02 11:00:00+05:30' AS as_of)
SELECT s.ticker,
       q.quote_ts,
       q.bid_price,
       q.ask_price,
       q.last_price,
       params.as_of - q.quote_ts AS quote_age
FROM params
CROSS JOIN security s
CROSS JOIN LATERAL (
    SELECT m.quote_ts, m.bid_price, m.ask_price, m.last_price
    FROM market_quote m
    WHERE m.ticker = s.ticker
      AND m.quote_ts <= params.as_of
    ORDER BY m.quote_ts DESC
    LIMIT 1
) q
ORDER BY s.ticker;
