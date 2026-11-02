-- Q03: Fill summary by order status and type
-- For each status and order type: number of orders, quantity ordered and filled, fill percentage and average number of fills per order.
WITH per_order AS (
    SELECT o.order_id, o.status, o.order_type, o.quantity,
           coalesce(sum(e.exec_qty), 0) AS filled,
           count(e.execution_id)        AS fills
    FROM orders o
    LEFT JOIN execution e ON e.order_id = o.order_id
    GROUP BY o.order_id
)
SELECT status,
       order_type,
       count(*)                                         AS orders,
       sum(quantity)                                    AS ordered_qty,
       sum(filled)                                      AS filled_qty,
       round(100.0 * sum(filled) / sum(quantity), 2)    AS fill_pct,
       round(avg(fills), 2)                             AS avg_fills_per_order
FROM per_order
GROUP BY status, order_type
ORDER BY status, order_type;
