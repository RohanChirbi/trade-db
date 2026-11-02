-- Q04: Fill ratio per strategy
-- Quantity ordered versus quantity executed for each strategy, with the traded value of its fills.
WITH per_order AS (
    SELECT o.order_id, o.strategy_id, o.quantity,
           coalesce(sum(e.exec_qty), 0)                AS filled,
           coalesce(sum(e.exec_qty * e.exec_price), 0) AS filled_value
    FROM orders o
    LEFT JOIN execution e ON e.order_id = o.order_id
    GROUP BY o.order_id
)
SELECT s.strategy_id,
       s.name,
       count(*)                                      AS orders,
       sum(p.quantity)                               AS ordered_qty,
       sum(p.filled)                                 AS filled_qty,
       round(sum(p.filled)::numeric / sum(p.quantity), 4) AS fill_ratio,
       round(sum(p.filled_value), 2)                 AS filled_value
FROM per_order p
JOIN strategy s ON s.strategy_id = p.strategy_id
GROUP BY s.strategy_id, s.name
ORDER BY s.strategy_id;
