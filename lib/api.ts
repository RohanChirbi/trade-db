// Wraps Route Handlers: turns HttpError and database errors into JSON responses with a useful message.
import { unstable_rethrow } from "next/navigation";
import { HttpError } from "./auth";

type PgError = { code?: string; message: string; detail?: string };

const PG_CLIENT_ERRORS: Record<string, number> = {
  "23514": 400, // check_violation (CHECK constraints and our trigger/procedure rules)
  "23503": 400, // foreign_key_violation
  "23505": 409, // unique_violation
  "23502": 400, // not_null_violation
  "22P02": 400, // invalid_text_representation
  "22003": 400, // numeric_value_out_of_range
  P0002: 404, // no_data_found
};

export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e); // let Next.js handle its own control-flow errors (e.g. stopping prerender at cookies())
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      const pg = e as PgError;
      if (pg.code && PG_CLIENT_ERRORS[pg.code]) {
        return Response.json({ error: pg.message, code: pg.code }, { status: PG_CLIENT_ERRORS[pg.code] });
      }
      console.error(e);
      const msg = (e as Error).message ?? "Server error";
      const unavailable = /ECONNREFUSED|Server selection timed out|connect/i.test(msg);
      return Response.json(
        { error: unavailable ? `Database unavailable: ${msg}` : msg },
        { status: unavailable ? 503 : 500 },
      );
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}
