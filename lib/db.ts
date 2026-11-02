// PostgreSQL connection pools. The app never uses the admin account:
//   db   -> APP role (read/write data, no DDL)       used for orders and config changes
//   dbRo -> READ-ONLY role (no access to app_user)   used for analytics and the Q1-Q20 runner
import { Pool, types } from "pg";

// Return DATE, TIMESTAMP (without zone) and INTERVAL as plain strings, so a trade date never
// shifts by the server's UTC offset when serialised to JSON.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1186, (v) => v);

const g = globalThis as unknown as { pgApp?: Pool; pgRo?: Pool };

export const db = (g.pgApp ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));
export const dbRo = (g.pgRo ??= new Pool({
  connectionString: process.env.DATABASE_URL_READONLY,
  max: 5,
  statement_timeout: 20_000,
}));
