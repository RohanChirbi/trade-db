-- Q11: Execution slippage versus arrival price
-- Average fill price against the mid quote when the order arrived, per strategy and order type.
-- Positive bps = paid more than mid (a cost). Cost in rupees = slippage x filled quantity.
WITH arrival AS (
    SELECT o.order_id, o.strategy_id, o.side, o.order_type,
           (q.bid_price + q.ask_price) / 2 AS arrival_mid
    FROM orders o
    CROSS JOIN LATERAL (
        SELECT m.bid_price, m.ask_price
        FROM market_quote m
        WHERE m.ticker = o.ticker AND m.quote_ts <= o.submitted_ts
        ORDER BY m.quote_ts DESC
        LIMIT 1
    ) q
), fills AS (
    SELECT order_id, sum(exec_qty) AS qty, sum(exec_qty * exec_price) / sum(exec_qty) AS avg_px
    FROM execution
    GROUP BY order_id
), slip AS (
    SELECT a.strategy_id, a.order_type, f.qty, a.arrival_mid,
           (f.avg_px - a.arrival_mid) * CASE a.side WHEN 'BUY' THEN 1 ELSE -1 END AS slip_per_share
    FROM arrival a
    JOIN fills f ON f.order_id = a.order_id
)
SELECT s.name                                                   AS strategy,
       sl.order_type,
       count(*)                                                 AS filled_orders,
       round(avg(sl.slip_per_share / sl.arrival_mid) * 10000, 2) AS avg_slippage_bps,
       round(sum(sl.slip_per_share * sl.qty), 2)                AS slippage_cost
FROM slip sl
JOIN strategy s ON s.strategy_id = sl.strategy_id
GROUP BY s.name, sl.order_type
ORDER BY s.name, sl.order_type;
