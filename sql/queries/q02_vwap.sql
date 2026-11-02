-- Q02: Daily VWAP per security
-- Volume-weighted average execution price per security and trading day (IST), compared with that day's closing price.
SELECT o.ticker,
       (e.exec_ts AT TIME ZONE 'Asia/Kolkata')::date                AS trade_date,
       sum(e.exec_qty)                                              AS volume,
       round(sum(e.exec_qty * e.exec_price) / sum(e.exec_qty), 4)   AS vwap,
       p.close_price,
       round((sum(e.exec_qty * e.exec_price) / sum(e.exec_qty) - p.close_price)
             / p.close_price * 10000, 2)                            AS vwap_vs_close_bps
FROM execution e
JOIN orders o      ON o.order_id = e.order_id
LEFT JOIN v_eod_price p
       ON p.ticker = o.ticker AND p.trade_date = (e.exec_ts AT TIME ZONE 'Asia/Kolkata')::date
GROUP BY o.ticker, (e.exec_ts AT TIME ZONE 'Asia/Kolkata')::date, p.close_price
ORDER BY trade_date DESC, o.ticker;
