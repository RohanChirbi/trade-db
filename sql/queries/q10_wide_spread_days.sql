-- Q10: Abnormally wide spreads
-- Security-days whose average spread (in bps) exceeds spread_multiple times that security's typical spread.
WITH daily AS (
    SELECT ticker,
           (quote_ts AT TIME ZONE 'Asia/Kolkata')::date                               AS trade_date,
           avg((ask_price - bid_price) / ((ask_price + bid_price) / 2)) * 10000       AS spread_bps
    FROM market_quote
    GROUP BY 1, 2
), typical AS (
    SELECT ticker, avg(spread_bps) AS typical_bps FROM daily GROUP BY ticker
)
SELECT d.ticker,
       d.trade_date,
       round(d.spread_bps, 2)                  AS spread_bps,
       round(t.typical_bps, 2)                 AS typical_bps,
       round(d.spread_bps / t.typical_bps, 2)  AS multiple
FROM daily d
JOIN typical t ON t.ticker = d.ticker
WHERE d.spread_bps > (SELECT param_value FROM surveillance_config WHERE param_name = 'spread_multiple') * t.typical_bps
ORDER BY multiple DESC;
