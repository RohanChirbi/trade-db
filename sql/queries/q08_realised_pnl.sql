-- Q08: Realised P&L per strategy
-- Total realised P&L, winning and losing days, and best and worst day for each strategy (from the position snapshots).
WITH daily AS (
    SELECT strategy_id, trade_date, sum(realised_pnl) AS pnl
    FROM position
    GROUP BY strategy_id, trade_date
)
SELECT s.strategy_id,
       s.name,
       round(sum(d.pnl), 2)                    AS total_realised_pnl,
       count(*) FILTER (WHERE d.pnl > 0)       AS winning_days,
       count(*) FILTER (WHERE d.pnl < 0)       AS losing_days,
       round(max(d.pnl), 2)                    AS best_day,
       round(min(d.pnl), 2)                    AS worst_day
FROM daily d
JOIN strategy s ON s.strategy_id = d.strategy_id
GROUP BY s.strategy_id, s.name
ORDER BY total_realised_pnl DESC;
