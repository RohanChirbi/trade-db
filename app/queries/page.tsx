"use client";
import { useState } from "react";
import { Button, Card, DataTable, fmtNum, Loading, Notice, Page, useApi } from "../components/ui";

type Q = { id: string; file: string; title: string; description: string };
type Result = Q & { sql: string; ms: number; columns: string[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean };

export default function QueriesPage() {
  const list = useApi<Q[]>("/api/queries");
  const [sel, setSel] = useState("q01");
  const [explain, setExplain] = useState(false);
  const run = useApi<Result>(`/api/queries/${sel}${explain ? "?explain=1" : ""}`);

  return (
    <Page title="Queries Q1–Q20" subtitle="Each query is read from sql/queries/*.sql and run unchanged on the read-only database role">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit lg:sticky lg:top-16">
          {!list.data ? <Loading /> : (
            <ul className="-m-2 max-h-[70vh] overflow-auto">
              {list.data.map((q) => (
                <li key={q.id}>
                  <button onClick={() => { setSel(q.id); setExplain(false); }}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${sel === q.id ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span className="mr-2 font-mono text-xs font-semibold text-slate-400">{q.id.toUpperCase()}</span>
                    {q.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="min-w-0 space-y-5">
          {run.error && <Notice>{run.error}</Notice>}
          {!run.data ? <Loading what="Running query" /> : (
            <>
              <Card
                title={<><span className="mr-2 font-mono text-slate-400">{run.data.id.toUpperCase()}</span>{run.data.title}</>}
                subtitle={run.data.description}
                actions={<Button variant="secondary" onClick={() => setExplain((e) => !e)}>{explain ? "Show results" : "EXPLAIN ANALYZE"}</Button>}
              >
                <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{run.data.sql}</pre>
                <p className="mt-2 text-xs text-slate-500">sql/queries/{run.data.file}</p>
              </Card>
              <Card
                title={explain ? "Query plan" : "Result"}
                subtitle={`${fmtNum(run.data.rowCount)} rows in ${run.data.ms} ms${run.data.truncated ? " · showing the first 500" : ""}`}
              >
                {explain ? (
                  <pre className="overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">
                    {run.data.rows.map((r) => String(r["QUERY PLAN"])).join("\n")}
                  </pre>
                ) : (
                  <DataTable rows={run.data.rows} maxHeight={560} empty="No rows returned (nothing crossed the threshold)" />
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
