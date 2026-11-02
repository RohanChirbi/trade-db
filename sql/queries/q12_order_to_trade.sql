-- Q12: Order-to-trade ratio and cancel rate per strategy
-- Orders submitted per execution and the share of orders cancelled; high values can indicate quote stuffing or layering.
SELECT s.name                                                        AS strategy,
       count(*)                                                      AS orders,
       sum(f.fills)                                                  AS executions,
       round(count(*)::numeric / nullif(sum(f.fills), 0), 3)         AS order_to_trade_ratio,
       count(*) FILTER (WHERE o.status = 'CANCELLED')                AS cancelled,
       round(avg((o.status = 'CANCELLED')::int), 4)                  AS cancel_rate
FROM orders o
JOIN strategy s ON s.strategy_id = o.strategy_id
CROSS JOIN LATERAL (SELECT count(*) AS fills FROM execution e WHERE e.order_id = o.order_id) f
GROUP BY s.name
ORDER BY cancel_rate DESC;
