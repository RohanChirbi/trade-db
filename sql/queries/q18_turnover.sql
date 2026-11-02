-- Q18: Excessive daily turnover (surveillance / risk)
-- Strategy-days whose traded value exceeded turnover_pct percent of the strategy's assigned capital.
WITH daily AS (
    SELECT o.strategy_id,
           (e.exec_ts AT TIME ZONE 'Asia/Kolkata')::date AS trade_date,
           sum(e.exec_qty * e.exec_price)                AS traded_value
    FROM execution e
    JOIN orders o ON o.order_id = e.order_id
    GROUP BY 1, 2
)
SELECT d.strategy_id,
       s.name                                                   AS strategy,
       d.trade_date,
       round(d.traded_value, 2)                                 AS traded_value,
       s.assigned_capital,
       round(100 * d.traded_value / s.assigned_capital, 2)      AS turnover_pct
FROM daily d
JOIN strategy s ON s.strategy_id = d.strategy_id
WHERE 100 * d.traded_value / s.assigned_capital
      > (SELECT param_value FROM surveillance_config WHERE param_name = 'turnover_pct')
ORDER BY turnover_pct DESC;
