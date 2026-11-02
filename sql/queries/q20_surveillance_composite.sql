-- Q20: Composite surveillance screen
-- Security-days that trip two or more checks: price move above price_move_pct, cancel rate above
-- cancel_rate_threshold, an unusually large order (Q15 rule), or a volume spike (Q17 rule).
WITH cfg AS (
    SELECT max(param_value) FILTER (WHERE param_name = 'price_move_pct')        AS move_pct,
           max(param_value) FILTER (WHERE param_name = 'cancel_rate_threshold') AS cancel_thr,
           max(param_value) FILTER (WHERE param_name = 'large_order_multiple')  AS large_mult,
           max(param_value) FILTER (WHERE param_name = 'volume_spike_multiple') AS spike_mult
    FROM surveillance_config
), closes AS (
    SELECT ticker, trade_date, close_price,
           lag(close_price) OVER (PARTITION BY ticker ORDER BY trade_date) AS prev_close
    FROM v_eod_price
), ord AS (
    SELECT o.ticker,
           (o.submitted_ts AT TIME ZONE 'Asia/Kolkata')::date             AS trade_date,
           count(*)                                                        AS orders,
           avg((o.status = 'CANCELLED')::int)                              AS cancel_rate,
           count(*) FILTER (WHERE o.quantity > cfg.large_mult * a.avg_qty) AS large_orders
    FROM orders o
    JOIN (SELECT ticker, avg(quantity) AS avg_qty FROM orders GROUP BY ticker) a ON a.ticker = o.ticker
    CROSS JOIN cfg
    GROUP BY 1, 2
), hourly AS (
    SELECT o.ticker, date_trunc('hour', e.exec_ts AT TIME ZONE 'Asia/Kolkata') AS hour_ist, sum(e.exec_qty) AS volume
    FROM execution e JOIN orders o ON o.order_id = e.order_id
    GROUP BY 1, 2
), spikes AS (
    SELECT h.ticker, h.hour_ist::date AS trade_date, count(*) AS spike_hours
    FROM hourly h
    JOIN (SELECT ticker, avg(volume) AS avg_volume FROM hourly GROUP BY ticker) n ON n.ticker = h.ticker
    CROSS JOIN cfg
    WHERE h.volume > cfg.spike_mult * n.avg_volume
    GROUP BY 1, 2
), flagged AS (
    SELECT c.ticker, c.trade_date,
           round(100 * (c.close_price - c.prev_close) / c.prev_close, 2) AS price_move_pct,
           o.orders,
           round(o.cancel_rate, 2)                                      AS cancel_rate,
           coalesce(o.large_orders, 0)                                  AS large_orders,
           coalesce(sp.spike_hours, 0)                                  AS spike_hours,
           (abs(100 * (c.close_price - c.prev_close) / c.prev_close) > cfg.move_pct)::int
         + (coalesce(o.cancel_rate, 0) > cfg.cancel_thr)::int
         + (coalesce(o.large_orders, 0) > 0)::int
         + (coalesce(sp.spike_hours, 0) > 0)::int                       AS flags
    FROM closes c
    CROSS JOIN cfg
    LEFT JOIN ord o     ON o.ticker = c.ticker  AND o.trade_date = c.trade_date
    LEFT JOIN spikes sp ON sp.ticker = c.ticker AND sp.trade_date = c.trade_date
    WHERE c.prev_close IS NOT NULL
)
SELECT *
FROM flagged
WHERE flags >= 2
ORDER BY flags DESC, trade_date DESC;
