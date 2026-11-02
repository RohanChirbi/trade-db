import { ObjectId } from "mongodb";
import { requireSession, HttpError } from "@/lib/auth";
import { handler, body } from "@/lib/api";
import { mongo } from "@/lib/mongo";
import { audit } from "@/lib/audit";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/alerts/[id]/notes">) => {
  const s = await requireSession("COMPLIANCE");
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Alert not found");
  const { note } = await body<{ note?: string }>(req);
  if (!note?.trim()) throw new HttpError(400, "Note text is required");
  const db = await mongo();
  if (!(await db.collection("alerts").countDocuments({ _id: new ObjectId(id) }))) throw new HttpError(404, "Alert not found");
  const doc = { alert_id: new ObjectId(id), author: s.username, note: note.trim(), created_at: new Date() };
  const { insertedId } = await db.collection("case_notes").insertOne(doc);
  await audit("CASE_NOTE", s, { alert_id: id });
  return Response.json({ _id: insertedId, ...doc }, { status: 201 });
});
