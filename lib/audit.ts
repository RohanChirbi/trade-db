// Audit log (MongoDB audit_log). Never fails the request it is recording.
import { mongo } from "./mongo";
import type { Session } from "./auth";

export async function audit(
  action: string,
  who: Pick<Session, "username" | "role"> | { username: string; role?: null },
  details: Record<string, unknown> = {},
) {
  try {
    const db = await mongo();
    await db.collection("audit_log").insertOne({
      ts: new Date(),
      action,
      username: who.username,
      role: who.role ?? null,
      details,
    });
  } catch (e) {
    console.error("audit log write failed:", (e as Error).message);
  }
}
