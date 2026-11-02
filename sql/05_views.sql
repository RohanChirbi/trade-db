-- 05_views.sql : reusable views
-- Assumption: the trading day is the Indian Standard Time calendar date (NSE).
-- If you use another exchange, change 'Asia/Kolkata' in the two places below.

-- Last traded price of each security on each trading day (used for unrealised P&L)
CREATE OR REPLACE VIEW v_eod_price AS
SELECT DISTINCT ON (ticker, d)
       ticker,
       d          AS trade_date,
       last_price AS close_price,
       quote_ts   AS close_ts
FROM (
    SELECT ticker,
           (quote_ts AT TIME ZONE 'Asia/Kolkata')::date AS d,
           quote_ts,
           last_price
    FROM market_quote
) q
ORDER BY ticker, d, quote_ts DESC;

-- End-of-day positions marked to the day's closing price
CREATE OR REPLACE VIEW v_position_valued AS
SELECT p.strategy_id,
       p.ticker,
       p.trade_date,
       p.quantity,
       p.avg_entry_price,
       p.realised_pnl,
       e.close_price,
       p.quantity * e.close_price                                   AS market_value,
       (e.close_price - COALESCE(p.avg_entry_price, e.close_price))
           * p.quantity                                             AS unrealised_pnl
FROM position p
LEFT JOIN v_eod_price e
       ON e.ticker = p.ticker AND e.trade_date = p.trade_date;

-- Daily performance per strategy (Q19)
CREATE OR REPLACE VIEW StrategyPerformance AS
WITH trade_agg AS (
    SELECT o.strategy_id,
           (x.exec_ts AT TIME ZONE 'Asia/Kolkata')::date                      AS trade_date,
           SUM(CASE WHEN o.side = 'BUY'  THEN x.exec_qty * x.exec_price END)  AS total_buy_value,
           SUM(CASE WHEN o.side = 'SELL' THEN x.exec_qty * x.exec_price END)  AS total_sell_value,
           SUM(x.exec_qty)                                                    AS trading_volume
    FROM execution x
    JOIN orders o ON o.order_id = x.order_id
    GROUP BY o.strategy_id, (x.exec_ts AT TIME ZONE 'Asia/Kolkata')::date
),
pos_agg AS (
    SELECT strategy_id,
           trade_date,
           SUM(realised_pnl)   AS realised_pnl,
           SUM(unrealised_pnl) AS unrealised_pnl,
           SUM(market_value)   AS net_exposure
    FROM v_position_valued
    GROUP BY strategy_id, trade_date
)
SELECT COALESCE(t.strategy_id, p.strategy_id)  AS strategy_id,
       COALESCE(t.trade_date,  p.trade_date)   AS trade_date,
       COALESCE(t.total_buy_value, 0)          AS total_buy_value,
       COALESCE(t.total_sell_value, 0)         AS total_sell_value,
       COALESCE(t.trading_volume, 0)           AS trading_volume,
       COALESCE(p.realised_pnl, 0)             AS realised_pnl,
       COALESCE(p.unrealised_pnl, 0)           AS unrealised_pnl,
       COALESCE(p.net_exposure, 0)             AS net_exposure,
       ROUND((COALESCE(p.realised_pnl, 0) + COALESCE(p.unrealised_pnl, 0))
             / s.assigned_capital, 6)          AS return_on_capital
FROM trade_agg t
FULL OUTER JOIN pos_agg p
       ON p.strategy_id = t.strategy_id AND p.trade_date = t.trade_date
JOIN strategy s
       ON s.strategy_id = COALESCE(t.strategy_id, p.strategy_id);