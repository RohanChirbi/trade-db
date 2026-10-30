-- row counts
SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'execution', count(*) FROM execution
UNION ALL SELECT 'market_quote', count(*) FROM market_quote UNION ALL SELECT 'position', count(*) FROM position;

-- fills exceed order quantity
SELECT o.order_id FROM orders o JOIN execution e USING (order_id)
GROUP BY o.order_id, o.quantity HAVING sum(e.exec_qty) > o.quantity;

-- status does not match fills
SELECT o.order_id, o.status, o.quantity, coalesce(sum(e.exec_qty),0) AS filled
FROM orders o LEFT JOIN execution e USING (order_id) GROUP BY o.order_id
HAVING (o.status='FILLED'  AND coalesce(sum(e.exec_qty),0) <> o.quantity)
    OR (o.status='OPEN'    AND coalesce(sum(e.exec_qty),0) <> 0)
    OR (o.status='PARTIAL' AND coalesce(sum(e.exec_qty),0) NOT BETWEEN 1 AND o.quantity-1);

-- cancelled status without a cancel event
SELECT o.order_id FROM orders o LEFT JOIN order_event ev
  ON ev.order_id=o.order_id AND ev.event_type='CANCELLED'
WHERE (o.status='CANCELLED') <> (ev.event_id IS NOT NULL);

-- executions before their order was submitted
SELECT e.execution_id FROM execution e JOIN orders o USING (order_id) WHERE e.exec_ts < o.submitted_ts;
