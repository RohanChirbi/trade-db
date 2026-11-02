"use client";
import { useEffect, useRef, useState } from "react";
import { Card, Loading, Notice, Page, useApi } from "../components/ui";

type Col = { table_name: string; column_name: string; data_type: string; character_maximum_length: number | null; numeric_precision: number | null; numeric_scale: number | null; is_nullable: string; column_default: string | null; is_identity: string };
type Con = { table_name: string; name: string; type: string; definition: string };
type Data = { er: string; columns: Col[]; constraints: Con[]; objects: { kind: string; name: string }[] };

const CON_TYPE: Record<string, string> = { p: "PRIMARY KEY", f: "FOREIGN KEY", u: "UNIQUE", c: "CHECK" };
const MONGO = [
  { name: "alerts", fields: "key (unique), type, severity, status, title, ticker, strategy_id, trade_date, source_query, details{query row}, created_at, reviewed_by", indexes: "uq_alert_key {key} unique · review_queue {status, severity, created_at} · by_type_date · by_ticker · by_strategy", why: "Written by the surveillance job; flexible evidence document per alert type" },
  { name: "audit_log", fields: "ts, action, username, role, details{}", indexes: "recent {ts:-1} · by_user {username, ts} · by_action {action, ts}", why: "Append-only log of logins, order actions, alert reviews and config changes" },
  { name: "case_notes", fields: "alert_id → alerts._id, author, note, created_at", indexes: "by_alert {alert_id, created_at}", why: "Investigator notes attached to an alert" },
];

function typeOf(c: Col) {
  if (c.data_type === "character varying") return `varchar(${c.character_maximum_length})`;
  if (c.data_type === "numeric") return `numeric(${c.numeric_precision},${c.numeric_scale})`;
  if (c.data_type === "timestamp with time zone") return "timestamptz";
  return c.data_type;
}

function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    let live = true;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "neutral", er: { useMaxWidth: true } });
      try {
        const { svg } = await mermaid.render("er-diagram", code);
        if (live && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (live) setErr((e as Error).message);
      }
    });
    return () => { live = false; };
  }, [code]);
  return err ? <Notice>{err}</Notice> : <div ref={ref} className="flex justify-center overflow-auto [&_svg]:max-w-full"><Loading what="Drawing diagram" /></div>;
}

export default function SchemaPage() {
  const { data, error } = useApi<Data>("/api/schema");
  if (error) return <Page title="Schema"><Notice>{error}</Notice></Page>;
  if (!data) return <Loading />;
  const tables = [...new Set(data.columns.map((c) => c.table_name))];
  const kinds = [...new Set(data.objects.map((o) => o.kind))];

  return (
    <Page title="Schema" subtitle="ER diagram, live data dictionary from the PostgreSQL catalog, and the MongoDB collections">
      <Card title="Entity-relationship diagram (PostgreSQL)" subtitle="Source: docs/er.mmd">
        <Mermaid code={data.er} />
      </Card>

      <Card title="Programmable objects" subtitle="Views, functions, triggers and named indexes currently in the database">
        <div className="grid gap-4 md:grid-cols-4">
          {kinds.map((k) => (
            <div key={k}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">{k}s</h3>
              <ul className="space-y-0.5 font-mono text-xs text-slate-700">
                {data.objects.filter((o) => o.kind === k).map((o) => <li key={o.name}>{o.name}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="MongoDB collections" subtitle="Created with $jsonSchema validators and indexes on first use (lib/mongo.ts)">
        <div className="grid gap-4 md:grid-cols-3">
          {MONGO.map((m) => (
            <div key={m.name} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="font-mono font-semibold text-slate-900">{m.name}</div>
              <p className="mt-1 text-xs text-slate-500">{m.why}</p>
              <p className="mt-2 text-xs"><b className="text-slate-600">Fields:</b> {m.fields}</p>
              <p className="mt-1 text-xs"><b className="text-slate-600">Indexes:</b> {m.indexes}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {tables.map((t) => (
          <Card key={t} title={<span className="font-mono">{t}</span>}>
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500"><tr><th className="py-1">Column</th><th>Type</th><th>Null</th><th>Default</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.columns.filter((c) => c.table_name === t).map((c) => (
                  <tr key={c.column_name}>
                    <td className="py-1 font-mono text-slate-800">{c.column_name}</td>
                    <td className="font-mono text-slate-600">{typeOf(c)}</td>
                    <td>{c.is_nullable === "YES" ? "yes" : ""}</td>
                    <td className="font-mono text-slate-500">{c.is_identity === "YES" ? "identity" : c.column_default}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-3 space-y-0.5 text-[11px] text-slate-600">
              {data.constraints.filter((c) => c.table_name === t).map((c) => (
                <li key={c.name}><span className="font-semibold text-slate-500">{CON_TYPE[c.type] ?? c.type}</span> <span className="font-mono">{c.definition}</span></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Page>
  );
}
