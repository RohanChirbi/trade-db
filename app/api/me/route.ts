import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = handler(async () => {
  const s = await requireSession();
  const strategy = s.strategyId
    ? (await db.query("SELECT strategy_id, name, strategy_type, assigned_capital FROM strategy WHERE strategy_id = $1", [s.strategyId])).rows[0]
    : null;
  return Response.json({ ...s, strategy });
});
