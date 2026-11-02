import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { runSurveillance } from "@/lib/surveillance";

export const POST = handler(async () => {
  const s = await requireSession("COMPLIANCE");
  const result = await runSurveillance(s.username);
  await audit("RUN_SURVEILLANCE", s, result);
  return Response.json(result);
});
