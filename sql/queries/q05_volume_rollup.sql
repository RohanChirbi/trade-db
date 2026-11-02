-- Q05: Traded volume per strategy and year (ROLLUP)
-- Executed quantity and value per strategy per year, with per-strategy subtotals and a grand total from GROUP BY ROLLUP.
SELECT CASE WHEN GROUPING(s.name) = 1 THEN 'ALL STRATEGIES' ELSE s.name END AS strategy,
       CASE WHEN GROUPING(y.yr)   = 1 THEN 'ALL YEARS'      ELSE y.yr::text END AS year,
       count(*)                                    AS fills,
       sum(e.exec_qty)                             AS volume,
       round(sum(e.exec_qty * e.exec_price), 2)    AS traded_value
FROM execution e
JOIN orders o   ON o.order_id = e.order_id
JOIN strategy s ON s.strategy_id = o.strategy_id
CROSS JOIN LATERAL (SELECT extract(year FROM e.exec_ts AT TIME ZONE 'Asia/Kolkata')::int AS yr) y
GROUP BY ROLLUP (s.name, y.yr)
ORDER BY GROUPING(s.name), s.name, GROUPING(y.yr), y.yr;
