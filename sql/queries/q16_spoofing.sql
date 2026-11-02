-- Q16: Possible spoofing (surveillance)
-- Strategies that, on one day and security, cancelled at least spoof_min_cancels above-average-size limit orders
-- within spoof_max_seconds of submitting them, without any fill.
WITH cfg AS (
    SELECT max(param_value) FILTER (WHERE param_name = 'spoof_min_cancels') AS min_cancels,
           max(param_value) FILTER (WHERE param_name = 'spoof_max_seconds') AS max_seconds
    FROM surveillance_config
), avg_size AS (
    SELECT ticker, avg(quantity) AS avg_qty FROM orders GROUP BY ticker
), quick AS (
    SELECT o.order_id, o.strategy_id, o.ticker, o.quantity,
           (o.submitted_ts AT TIME ZONE 'Asia/Kolkata')::date   AS trade_date,
           extract(epoch FROM c.event_ts - o.submitted_ts)      AS seconds_to_cancel
    FROM orders o
    JOIN order_event c ON c.order_id = o.order_id AND c.event_type = 'CANCELLED'
    JOIN avg_size a    ON a.ticker = o.ticker
    CROSS JOIN cfg
    WHERE o.order_type = 'LIMIT'
      AND o.quantity > a.avg_qty
      AND c.event_ts - o.submitted_ts <= make_interval(secs => cfg.max_seconds)
      AND NOT EXISTS (SELECT 1 FROM execution e WHERE e.order_id = o.order_id)
)
SELECT q.strategy_id,
       s.name                                   AS strategy,
       q.ticker,
       q.trade_date,
       count(*)                                 AS quick_cancels,
       sum(q.quantity)                          AS cancelled_qty,
       round(avg(q.seconds_to_cancel), 1)       AS avg_seconds_to_cancel,
       array_agg(q.order_id ORDER BY q.order_id) AS order_ids
FROM quick q
JOIN strategy s ON s.strategy_id = q.strategy_id
GROUP BY q.strategy_id, s.name, q.ticker, q.trade_date
HAVING count(*) >= (SELECT min_cancels FROM cfg)
ORDER BY quick_cancels DESC, q.trade_date;
