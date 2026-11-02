-- Q19: Strategy performance (StrategyPerformance view)
-- Buy and sell value, volume, realised and unrealised P&L, net exposure and return on capital for the last 10 trading days.
SELECT sp.trade_date,
       s.name AS strategy,
       sp.total_buy_value,
       sp.total_sell_value,
       sp.trading_volume,
       round(sp.realised_pnl, 2)   AS realised_pnl,
       round(sp.unrealised_pnl, 2) AS unrealised_pnl,
       round(sp.net_exposure, 2)   AS net_exposure,
       sp.return_on_capital
FROM StrategyPerformance sp
JOIN strategy s ON s.strategy_id = sp.strategy_id
WHERE sp.trade_date IN (SELECT DISTINCT trade_date FROM StrategyPerformance ORDER BY trade_date DESC LIMIT 10)
ORDER BY sp.trade_date DESC, s.name;
