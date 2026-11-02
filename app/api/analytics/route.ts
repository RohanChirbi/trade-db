import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { dbRo } from "@/lib/db";
import { getQuery, executable } from "@/lib/queries";

// Spread (Q01), VWAP vs close for one security (Q02 logic), slippage (Q11).
// The VWAP window is the last 120 days of market data, so orders placed live in the app don't shift it.
export const GET = handler(async (req: Request) => {
  const s = await requireSession();
  const ticker = new URL(req.url).searchParams.get("ticker") ?? "RELIANCE.NS";
  const [q01, q11] = await Promise.all([getQuery("q01"), getQuery("q11")]);
  const [spread, slippage, vwap, myStrategy] = await Promise.all([
    dbRo.query(executable(q01!)),
    dbRo.query(executable(q11!)),
    dbRo.query(
      `SELECT (e.exec_ts AT TIME ZONE 'Asia/Kolkata')::date AS trade_date,
              round(sum(e.exec_qty * e.exec_price) / sum(e.exec_qty), 2) AS vwap,
              max(p.close_price) AS close_price,
              sum(e.exec_qty) AS volume
       FROM execution e JOIN orders o USING (order_id)
       LEFT JOIN v_eod_price p ON p.ticker = o.ticker AND p.trade_date = (e.exec_ts AT TIME ZONE 'Asia/Kolkata')::date
       WHERE o.ticker = $1 AND e.exec_ts >= (SELECT max(quote_ts) FROM market_quote) - interval '120 days'
       GROUP BY 1 ORDER BY 1`,
      [ticker],
    ),
    s.strategyId ? dbRo.query("SELECT name FROM strategy WHERE strategy_id = $1", [s.strategyId]) : null,
  ]);
  const mine = myStrategy?.rows[0]?.name;
  return Response.json({
    ticker,
    spread: spread.rows,
    vwap: vwap.rows,
    slippage: s.role === "TRADER" ? slippage.rows.filter((r) => r.strategy === mine) : slippage.rows,
  });
});
