-- Q14: Maximum drawdown and capital utilisation per strategy
-- Largest fall of cumulative P&L from its previous peak, the day it bottomed out, and peak gross exposure as a share of capital.
WITH cum AS (
    SELECT strategy_id, trade_date, gross_exposure,
           sum(daily_pnl) OVER (PARTITION BY strategy_id ORDER BY trade_date) AS cum_pnl
    FROM risk_metric
), dd AS (
    SELECT *, max(cum_pnl) OVER (PARTITION BY strategy_id ORDER BY trade_date) - cum_pnl AS drawdown
    FROM cum
)
SELECT s.name                                                        AS strategy,
       round(max(dd.drawdown), 2)                                    AS max_drawdown,
       (array_agg(dd.trade_date ORDER BY dd.drawdown DESC))[1]       AS trough_date,
       round((array_agg(dd.cum_pnl ORDER BY dd.trade_date DESC))[1], 2) AS final_cum_pnl,
       round(100 * max(dd.gross_exposure) / s.assigned_capital, 2)   AS peak_utilisation_pct
FROM dd
JOIN strategy s ON s.strategy_id = dd.strategy_id
GROUP BY s.name, s.assigned_capital
ORDER BY max_drawdown DESC;
