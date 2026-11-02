import { requireSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { dbRo } from "@/lib/db";

// Order detail with its fills and lifecycle events
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/orders/[id]">) => {
  const s = await requireSession();
  const id = Number((await ctx.params).id);
  const { rows } = await dbRo.query(
    `SELECT o.*, s.name AS strategy FROM orders o JOIN strategy s USING (strategy_id) WHERE o.order_id = $1`,
    [id],
  );
  const order = rows[0];
  if (!order || (s.role === "TRADER" && order.strategy_id !== s.strategyId)) throw new HttpError(404, "Order not found");
  const [fills, events] = await Promise.all([
    dbRo.query("SELECT execution_id, exec_qty, exec_price, exec_ts FROM execution WHERE order_id = $1 ORDER BY exec_ts", [id]),
    dbRo.query("SELECT event_id, event_type, event_ts FROM order_event WHERE order_id = $1 ORDER BY event_ts, event_id", [id]),
  ]);
  return Response.json({ order, fills: fills.rows, events: events.rows });
});
