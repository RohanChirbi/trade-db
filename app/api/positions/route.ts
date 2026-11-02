import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { dbRo } from "@/lib/db";

// Current positions marked to the latest price, latest risk metrics and the daily P&L history
export const GET = handler(async (req: Request) => {
  const s = await requireSession();
  const p = new URL(req.url).searchParams;
  const sid = s.role === "TRADER" ? s.strategyId : p.get("strategy") ? Number(p.get("strategy")) : null;
  const [positions, risk, history] = await Promise.all([
    dbRo.query(
      `SELECT v.*, s.name AS strategy FROM v_current_position v JOIN strategy s USING (strategy_id)
       WHERE ($1::int IS NULL OR v.strategy_id = $1) AND v.quantity <> 0
       ORDER BY abs(v.market_value) DESC`,
      [sid],
    ),
    dbRo.query(
      `SELECT DISTINCT ON (r.strategy_id) r.*, s.name AS strategy, s.assigned_capital
       FROM risk_metric r JOIN strategy s USING (strategy_id)
       WHERE $1::int IS NULL OR r.strategy_id = $1
       ORDER BY r.strategy_id, r.trade_date DESC`,
      [sid],
    ),
    dbRo.query(
      `SELECT trade_date, round(sum(daily_pnl), 2) AS daily_pnl,
              round(sum(sum(daily_pnl)) OVER (ORDER BY trade_date), 2) AS cum_pnl,
              round(sum(gross_exposure), 2) AS gross_exposure
       FROM risk_metric WHERE $1::int IS NULL OR strategy_id = $1
       GROUP BY trade_date ORDER BY trade_date`,
      [sid],
    ),
  ]);
  return Response.json({ positions: positions.rows, risk: risk.rows, history: history.rows });
});
