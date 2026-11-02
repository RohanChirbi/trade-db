import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { mongo } from "@/lib/mongo";

export const GET = handler(async (req: Request) => {
  await requireSession("COMPLIANCE");
  const action = new URL(req.url).searchParams.get("action");
  const db = await mongo();
  const rows = await db.collection("audit_log").find(action ? { action } : {}).sort({ ts: -1 }).limit(100).toArray();
  return Response.json(rows);
});
