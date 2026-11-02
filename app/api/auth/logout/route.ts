import { clearSession, getSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { audit } from "@/lib/audit";

export const POST = handler(async () => {
  const s = await getSession();
  if (s) await audit("LOGOUT", s);
  await clearSession();
  return Response.json({ ok: true });
});
