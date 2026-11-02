-- Q13: Cumulative P&L per strategy (running SUM window)
-- Daily P&L (realised + change in unrealised) and its running total for every strategy, latest days first.
SELECT r.strategy_id,
       s.name,
       r.trade_date,
       r.daily_pnl,
       sum(r.daily_pnl) OVER (PARTITION BY r.strategy_id ORDER BY r.trade_date) AS cumulative_pnl
FROM risk_metric r
JOIN strategy s ON s.strategy_id = r.strategy_id
ORDER BY r.trade_date DESC, r.strategy_id;
