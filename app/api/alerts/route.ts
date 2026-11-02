import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { mongo } from "@/lib/mongo";

// GET /api/alerts?status=&type=&severity=&ticker=
export const GET = handler(async (req: Request) => {
  await requireSession("COMPLIANCE");
  const p = new URL(req.url).searchParams;
  const filter: Record<string, string> = {};
  for (const k of ["status", "type", "severity", "ticker"]) if (p.get(k)) filter[k] = p.get(k)!;
  const db = await mongo();
  const rows = await db
    .collection("alerts")
    .find(filter, { projection: { details: 0 } })
    .sort({ severity: 1, trade_date: -1 })
    .limit(300)
    .toArray();
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
  rows.sort((a, b) => rank[a.severity] - rank[b.severity] || String(b.trade_date).localeCompare(String(a.trade_date)));
  return Response.json(rows);
});
