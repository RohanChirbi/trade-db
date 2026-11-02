import { ObjectId } from "mongodb";
import { requireSession, HttpError } from "@/lib/auth";
import { handler, body } from "@/lib/api";
import { mongo, ALERT_STATUSES } from "@/lib/mongo";
import { audit } from "@/lib/audit";

const oid = (id: string) => {
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Alert not found");
  return new ObjectId(id);
};

export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/alerts/[id]">) => {
  await requireSession("COMPLIANCE");
  const id = oid((await ctx.params).id);
  const db = await mongo();
  const alert = await db.collection("alerts").findOne({ _id: id });
  if (!alert) throw new HttpError(404, "Alert not found");
  const notes = await db.collection("case_notes").find({ alert_id: id }).sort({ created_at: 1 }).toArray();
  return Response.json({ alert, notes });
});

// Review workflow: OPEN -> UNDER_REVIEW -> ESCALATED / DISMISSED
export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/alerts/[id]">) => {
  const s = await requireSession("COMPLIANCE");
  const id = oid((await ctx.params).id);
  const { status } = await body<{ status?: string }>(req);
  if (!status || !(ALERT_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, `status must be one of ${ALERT_STATUSES.join(", ")}`);
  const db = await mongo();
  const before = await db.collection("alerts").findOneAndUpdate(
    { _id: id },
    { $set: { status, reviewed_by: s.username, reviewed_at: new Date() } },
  );
  if (!before) throw new HttpError(404, "Alert not found");
  await audit("ALERT_STATUS", s, { alert_id: id.toString(), key: before.key, from: before.status, to: status });
  return Response.json({ ok: true });
});
