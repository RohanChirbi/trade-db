import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { listQueries } from "@/lib/queries";

export const GET = handler(async () => {
  await requireSession("COMPLIANCE");
  return Response.json((await listQueries()).map(({ id, file, title, description }) => ({ id, file, title, description })));
});
