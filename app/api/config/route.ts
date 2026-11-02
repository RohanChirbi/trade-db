import { requireSession, HttpError } from "@/lib/auth";
import { handler, body } from "@/lib/api";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = handler(async () => {
  await requireSession();
  const { rows } = await db.query("SELECT param_name, param_value, description FROM surveillance_config ORDER BY param_name");
  return Response.json(rows);
});

// Compliance tunes a surveillance threshold
export const PATCH = handler(async (req: Request) => {
  const s = await requireSession("COMPLIANCE");
  const { param_name, param_value } = await body<{ param_name?: string; param_value?: number }>(req);
  const v = Number(param_value);
  if (!param_name || !Number.isFinite(v) || v < 0) throw new HttpError(400, "param_name and a non-negative param_value are required");
  const { rows } = await db.query(
    `UPDATE surveillance_config c SET param_value = $2
     FROM (SELECT param_value AS old FROM surveillance_config WHERE param_name = $1) o
     WHERE c.param_name = $1 RETURNING o.old`,
    [param_name, v],
  );
  if (!rows[0]) throw new HttpError(404, "Unknown parameter");
  await audit("CONFIG_CHANGE", s, { param_name, from: Number(rows[0].old), to: v });
  return Response.json({ ok: true });
});
