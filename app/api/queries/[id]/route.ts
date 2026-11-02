import { requireSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { dbRo } from "@/lib/db";
import { getQuery, executable } from "@/lib/queries";

// Runs one of Q1-Q20 exactly as written in sql/queries, on the read-only connection
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/queries/[id]">) => {
  await requireSession("COMPLIANCE");
  const q = await getQuery((await ctx.params).id);
  if (!q) throw new HttpError(404, "Unknown query");
  const explain = new URL(req.url).searchParams.get("explain") === "1";
  const started = performance.now();
  const res = await dbRo.query(explain ? `EXPLAIN (ANALYZE, COSTS OFF) ${executable(q)}` : executable(q));
  const ms = Math.round((performance.now() - started) * 10) / 10;
  const LIMIT = 500;
  return Response.json({
    ...q,
    ms,
    columns: res.fields.map((f) => f.name),
    rows: res.rows.slice(0, LIMIT),
    rowCount: res.rows.length,
    truncated: res.rows.length > LIMIT,
  });
});
