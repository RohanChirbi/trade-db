import { requireSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

// UPDATE flow: cancel_order() sets CANCELLED and records the CANCELLED event
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/orders/[id]/cancel">) => {
  const s = await requireSession("TRADER");
  const id = Number((await ctx.params).id);
  const owner = await db.query("SELECT strategy_id FROM orders WHERE order_id = $1", [id]);
  if (!owner.rows[0] || owner.rows[0].strategy_id !== s.strategyId) throw new HttpError(404, "Order not found");
  await db.query("SELECT cancel_order($1)", [id]);
  await audit("CANCEL_ORDER", s, { order_id: id });
  return Response.json({ ok: true });
});
