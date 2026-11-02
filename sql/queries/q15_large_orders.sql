-- Q15: Unusually large orders (surveillance)
-- Orders larger than large_order_multiple times the average order size for the same security.
WITH avg_size AS (
    SELECT ticker, avg(quantity) AS avg_qty FROM orders GROUP BY ticker
)
SELECT o.order_id,
       o.strategy_id,
       s.name                              AS strategy,
       o.ticker,
       o.side,
       o.order_type,
       o.quantity,
       round(a.avg_qty, 1)                 AS avg_qty,
       round(o.quantity / a.avg_qty, 1)    AS size_multiple,
       o.submitted_ts,
       o.status
FROM orders o
JOIN avg_size a ON a.ticker = o.ticker
JOIN strategy s ON s.strategy_id = o.strategy_id
WHERE o.quantity > (SELECT param_value FROM surveillance_config WHERE param_name = 'large_order_multiple') * a.avg_qty
ORDER BY size_multiple DESC, o.order_id;
