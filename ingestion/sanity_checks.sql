-- ingestion/sanity_checks.sql : run after loading. Every "violations" value should be 0.

SELECT 'security' AS table_name, count(*) AS row_count FROM security
UNION ALL SELECT 'strategy',     count(*) FROM strategy
UNION ALL SELECT 'market_quote', count(*) FROM market_quote
UNION ALL SELECT 'orders',       count(*) FROM orders
UNION ALL SELECT 'order_event',  count(*) FROM order_event
UNION ALL SELECT 'execution',    count(*) FROM execution
UNION ALL SELECT 'position',     count(*) FROM position
UNION ALL SELECT 'risk_metric',  count(*) FROM risk_metric
UNION ALL SELECT 'app_user',     count(*) FROM app_user
ORDER BY table_name;

WITH filled AS (
    SELECT o.order_id, o.status, o.quantity, coalesce(sum(e.exec_qty), 0) AS filled
    FROM orders o LEFT JOIN execution e USING (order_id)
    GROUP BY o.order_id
)
SELECT 'fills exceed order quantity' AS check_name, count(*) AS violations
FROM filled WHERE filled > quantity
UNION ALL
SELECT 'status does not match fills', count(*)
FROM filled
WHERE (status = 'FILLED'  AND filled <> quantity)
   OR (status = 'OPEN'    AND filled <> 0)
   OR (status = 'PARTIAL' AND filled NOT BETWEEN 1 AND quantity - 1)
UNION ALL
SELECT 'CANCELLED status <> cancel event', count(*)
FROM orders o
LEFT JOIN order_event ev ON ev.order_id = o.order_id AND ev.event_type = 'CANCELLED'
WHERE (o.status = 'CANCELLED') <> (ev.event_id IS NOT NULL)
UNION ALL
SELECT 'execution before order submitted', count(*)
FROM execution e JOIN orders o USING (order_id)
WHERE e.exec_ts < o.submitted_ts
UNION ALL
SELECT 'order without SUBMITTED event', count(*)
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_event ev WHERE ev.order_id = o.order_id AND ev.event_type = 'SUBMITTED');
