-- Q07: Most traded securities each quarter (RANK window function)
-- Top 3 securities by traded value in every quarter, with their share of that quarter's total.
WITH q AS (
    SELECT o.ticker,
           to_char(e.exec_ts AT TIME ZONE 'Asia/Kolkata', 'YYYY-"Q"Q') AS quarter,
           sum(e.exec_qty * e.exec_price)                              AS traded_value
    FROM execution e
    JOIN orders o ON o.order_id = e.order_id
    GROUP BY 1, 2
)
SELECT quarter, rnk AS rank, ticker, round(traded_value, 2) AS traded_value, share_pct
FROM (
    SELECT quarter, ticker, traded_value,
           RANK() OVER (PARTITION BY quarter ORDER BY traded_value DESC)                AS rnk,
           round(100 * traded_value / sum(traded_value) OVER (PARTITION BY quarter), 2) AS share_pct
    FROM q
) ranked
WHERE rnk <= 3
ORDER BY quarter, rnk;
