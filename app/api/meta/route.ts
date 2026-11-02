// Reference data for forms and filters
import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { dbRo } from "@/lib/db";

export const GET = handler(async () => {
  await requireSession();
  const [securities, strategies, quotes] = await Promise.all([
    dbRo.query("SELECT ticker, company_name, sector, exchange, tick_size FROM security ORDER BY ticker"),
    dbRo.query("SELECT strategy_id, name, strategy_type, assigned_capital FROM strategy ORDER BY strategy_id"),
    dbRo.query(`SELECT DISTINCT ON (ticker) ticker, bid_price, ask_price, last_price, quote_ts
                FROM market_quote ORDER BY ticker, quote_ts DESC`),
  ]);
  return Response.json({ securities: securities.rows, strategies: strategies.rows, quotes: quotes.rows });
});
