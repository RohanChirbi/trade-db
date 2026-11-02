import { requireSession, HttpError } from "@/lib/auth";
import { handler, body } from "@/lib/api";
import { db, dbRo } from "@/lib/db";
import { audit } from "@/lib/audit";

// GET /api/orders?status=&ticker=&side=&strategy=&from=&to=&page=  (traders are limited to their own strategy)
export const GET = handler(async (req: Request) => {
  const s = await requireSession();
  const p = new URL(req.url).searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (s.role === "TRADER") add("o.strategy_id = ?", s.strategyId);
  else if (p.get("strategy")) add("o.strategy_id = ?", Number(p.get("strategy")));
  if (p.get("status")) add("o.status = ?", p.get("status"));
  if (p.get("ticker")) add("o.ticker = ?", p.get("ticker"));
  if (p.get("side")) add("o.side = ?", p.get("side"));
  if (p.get("from")) add("o.submitted_ts >= ?::date", p.get("from"));
  if (p.get("to")) add("o.submitted_ts < ?::date + 1", p.get("to"));
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = 25;
  const page = Math.max(1, Number(p.get("page") ?? 1));

  const [rows, total] = await Promise.all([
    dbRo.query(
      `SELECT o.order_id, o.strategy_id, s.name AS strategy, o.ticker, o.side, o.order_type, o.quantity,
              o.limit_price, o.submitted_ts, o.status,
              coalesce(f.filled, 0) AS filled_qty, round(f.avg_px, 4) AS avg_fill_price
       FROM orders o
       JOIN strategy s USING (strategy_id)
       LEFT JOIN LATERAL (SELECT sum(exec_qty) AS filled, sum(exec_qty * exec_price) / sum(exec_qty) AS avg_px
                          FROM execution e WHERE e.order_id = o.order_id) f ON true
       ${filter}
       ORDER BY o.submitted_ts DESC, o.order_id DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      args,
    ),
    dbRo.query(`SELECT count(*)::int AS n FROM orders o ${filter}`, args),
  ]);
  return Response.json({ rows: rows.rows, total: total.rows[0].n, page, pageSize });
});

// POST /api/orders  -> submit_order(): order + event + fill + position in one transaction
export const POST = handler(async (req: Request) => {
  const s = await requireSession("TRADER");
  const b = await body<{ ticker?: string; side?: string; order_type?: string; quantity?: number; limit_price?: number | null }>(req);
  const qty = Number(b.quantity);
  if (!b.ticker || !b.side || !b.order_type || !Number.isInteger(qty) || qty <= 0) {
    throw new HttpError(400, "ticker, side, order_type and a positive whole quantity are required");
  }
  const limit = b.order_type === "LIMIT" ? Number(b.limit_price) : null;
  if (limit !== null && !(limit > 0)) throw new HttpError(400, "A LIMIT order needs a positive limit price");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM submit_order($1, $2, $3, $4, $5, $6)", [
      s.strategyId, b.ticker, b.side, b.order_type, qty, limit,
    ]);
    await client.query("COMMIT");
    await audit("PLACE_ORDER", s, { ...rows[0], ticker: b.ticker, side: b.side, order_type: b.order_type, quantity: qty, limit_price: limit });
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    await audit("PLACE_ORDER_REJECTED", s, { ticker: b.ticker, side: b.side, quantity: qty, reason: (e as Error).message });
    throw e;
  } finally {
    client.release();
  }
});
