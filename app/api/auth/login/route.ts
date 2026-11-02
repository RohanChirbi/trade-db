import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, HttpError, type Role } from "@/lib/auth";
import { handler, body } from "@/lib/api";
import { audit } from "@/lib/audit";

export const POST = handler(async (req: Request) => {
  const { username, password } = await body<{ username?: string; password?: string }>(req);
  if (!username || !password) throw new HttpError(400, "Username and password are required");

  const { rows } = await db.query<{ user_id: number; username: string; password_hash: string; role: Role; strategy_id: number | null }>(
    "SELECT user_id, username, password_hash, role, strategy_id FROM app_user WHERE username = $1",
    [username.trim().toLowerCase()],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await audit("LOGIN_FAILED", { username: username.trim().toLowerCase() });
    throw new HttpError(401, "Invalid username or password");
  }
  const session = { uid: user.user_id, username: user.username, role: user.role, strategyId: user.strategy_id };
  await createSession(session);
  await audit("LOGIN", session, { ip: req.headers.get("x-forwarded-for") ?? "local" });
  return Response.json(session);
});
