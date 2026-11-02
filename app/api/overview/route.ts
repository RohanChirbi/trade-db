// Landing page numbers; a trader only sees their own strategy
import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { dbRo } from "@/lib/db";

export const GET = handler(async () => {
  const s = await requireSession();
  const sid = s.role === "TRADER" ? s.strategyId : null;
  const [totals, pnl, recent] = await Promise.all([
    dbRo.query(
      `SELECT (SELECT count(*) FROM orders o WHERE $1::int IS NULL OR o.strategy_id = $1)                     AS orders,
              (SELECT count(*) FROM execution e JOIN orders o USING (order_id) WHERE $1::int IS NULL OR o.strategy_id = $1) AS executions,
              (SELECT count(*) FROM orders o WHERE status IN ('OPEN','PARTIAL') AND ($1::int IS NULL OR o.strategy_id = $1)) AS working_orders,
              (SELECT count(*) FROM market_quote)                                                          AS quotes,
              (SELECT count(*) FROM security)                                                              AS securities,
              (SELECT min(trade_date) FROM risk_metric)                                                    AS first_day,
              (SELECT max(trade_date) FROM risk_metric)                                                    AS last_day,
              (SELECT sum(daily_pnl) FROM risk_metric r WHERE $1::int IS NULL OR r.strategy_id = $1)       AS total_pnl`,
      [sid],
    ),
    // weekly points of cumulative P&L per strategy for the chart
    dbRo.query(
      `WITH c AS (
         SELECT r.strategy_id, s.name, r.trade_date,
                sum(r.daily_pnl) OVER (PARTITION BY r.strategy_id ORDER BY r.trade_date) AS cum_pnl
         FROM risk_metric r JOIN strategy s USING (strategy_id)
         WHERE $1::int IS NULL OR r.strategy_id = $1)
       SELECT DISTINCT ON (strategy_id, date_trunc('week', trade_date)) strategy_id, name, trade_date, round(cum_pnl, 2) AS cum_pnl
       FROM c ORDER BY strategy_id, date_trunc('week', trade_date), trade_date DESC`,
      [sid],
    ),
    dbRo.query(
      `SELECT o.order_id, s.name AS strategy, o.ticker, o.side, o.order_type, o.quantity, o.status, o.submitted_ts
       FROM orders o JOIN strategy s USING (strategy_id)
       WHERE $1::int IS NULL OR o.strategy_id = $1
       ORDER BY o.submitted_ts DESC LIMIT 8`,
      [sid],
    ),
  ]);
  return Response.json({ totals: totals.rows[0], pnl: pnl.rows, recent: recent.rows });
});
