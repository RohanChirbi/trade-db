-- Q06: Order flow and buy/sell imbalance per security
-- Orders, cancellations and executed buy and sell quantity per security. Imbalance = (buy - sell) / (buy + sell).
WITH ord AS (
    SELECT ticker,
           count(*)                                      AS orders,
           count(*) FILTER (WHERE status = 'CANCELLED')  AS cancelled
    FROM orders
    GROUP BY ticker
), fills AS (
    SELECT o.ticker,
           sum(e.exec_qty) FILTER (WHERE o.side = 'BUY')  AS buy_qty,
           sum(e.exec_qty) FILTER (WHERE o.side = 'SELL') AS sell_qty
    FROM execution e
    JOIN orders o ON o.order_id = e.order_id
    GROUP BY o.ticker
)
SELECT s.ticker, s.company_name, s.sector,
       ord.orders, ord.cancelled,
       f.buy_qty, f.sell_qty,
       round((f.buy_qty - f.sell_qty)::numeric / (f.buy_qty + f.sell_qty), 4) AS imbalance
FROM security s
JOIN ord      ON ord.ticker = s.ticker
JOIN fills f  ON f.ticker = s.ticker
ORDER BY ord.orders DESC;
