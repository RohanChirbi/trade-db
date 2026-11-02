-- Q17: Volume spikes (surveillance)
-- Hours in which a security's executed volume exceeded volume_spike_multiple times its average hourly volume.
WITH hourly AS (
    SELECT o.ticker,
           date_trunc('hour', e.exec_ts AT TIME ZONE 'Asia/Kolkata') AS hour_ist,
           sum(e.exec_qty)                                           AS volume
    FROM execution e
    JOIN orders o ON o.order_id = e.order_id
    GROUP BY 1, 2
), normal AS (
    SELECT ticker, avg(volume) AS avg_volume FROM hourly GROUP BY ticker
)
SELECT h.ticker,
       h.hour_ist,
       h.hour_ist::date                       AS trade_date,
       h.volume,
       round(n.avg_volume, 1)                 AS avg_hourly_volume,
       round(h.volume / n.avg_volume, 1)      AS multiple
FROM hourly h
JOIN normal n ON n.ticker = h.ticker
WHERE h.volume > (SELECT param_value FROM surveillance_config WHERE param_name = 'volume_spike_multiple') * n.avg_volume
ORDER BY multiple DESC;
