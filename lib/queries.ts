// The Q1-Q20 query files in sql/queries are the single source of truth: the app reads and runs
// them as-is, so what is shown in the app is exactly what is submitted in the repo.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type QueryInfo = { id: string; file: string; title: string; description: string; sql: string };

const DIR = path.join(process.cwd(), "sql", "queries");

function parse(file: string, text: string): QueryInfo {
  const header = text.split("\n").filter((l) => l.startsWith("--")).map((l) => l.replace(/^--\s?/, ""));
  const [first = "", ...rest] = header;
  const m = first.match(/^(Q\d+):\s*(.*)$/);
  return {
    id: (m?.[1] ?? file).toLowerCase(),
    file,
    title: m?.[2] ?? file,
    description: rest.join(" "),
    sql: text.trim(),
  };
}

export async function listQueries(): Promise<QueryInfo[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(files.map(async (f) => parse(f, await readFile(path.join(DIR, f), "utf8"))));
}

export async function getQuery(id: string): Promise<QueryInfo | undefined> {
  return (await listQueries()).find((q) => q.id === id.toLowerCase());
}

/** SQL without comments and trailing semicolon, ready to send through the pg driver. */
export function executable(q: QueryInfo) {
  return q.sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n").trim().replace(/;\s*$/, "");
}
