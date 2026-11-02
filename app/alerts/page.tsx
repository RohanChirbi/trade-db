"use client";
import { useMemo, useState } from "react";
import { api, Badge, Button, Card, DataTable, fmtCell, fmtTs, inputCls, Loading, Notice, Page, Select, useApi } from "../components/ui";

type Alert = { _id: string; key: string; type: string; severity: string; status: string; title: string; ticker: string | null; strategy: string | null; trade_date: string | null; source_query: string; reviewed_by?: string; created_at: string };
type Detail = { alert: Alert & { details: Record<string, unknown> }; notes: { _id: string; author: string; note: string; created_at: string }[] };

const STATUSES = ["OPEN", "UNDER_REVIEW", "ESCALATED", "DISMISSED"];
const TYPES = ["SPOOFING", "LARGE_ORDER", "VOLUME_SPIKE", "TURNOVER", "MULTI_FLAG", "WIDE_SPREAD"];

export default function AlertsPage() {
  const [f, setF] = useState({ status: "", type: "", severity: "" });
  const qs = useMemo(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [f]);
  const list = useApi<Alert[]>(`/api/alerts?${qs}`);
  const [sel, setSel] = useState<string | null>(null);

  return (
    <Page title="Alert review" subtitle="Work the queue: review, escalate or dismiss, and keep case notes (MongoDB alerts + case_notes)">
      <div className="grid gap-5 lg:grid-cols-[1fr_440px]">
        <Card className="min-w-0" title={list.data ? `${list.data.length} alerts` : "Alerts"}
          actions={<div className="flex gap-2">
            <Select value={f.status} onChange={(v) => setF((x) => ({ ...x, status: v }))} placeholder="Any status" options={STATUSES} />
            <Select value={f.type} onChange={(v) => setF((x) => ({ ...x, type: v }))} placeholder="Any type" options={TYPES} />
            <Select value={f.severity} onChange={(v) => setF((x) => ({ ...x, severity: v }))} placeholder="Any severity" options={["HIGH", "MEDIUM", "LOW"]} />
          </div>}>
          {list.error && <Notice>{list.error}</Notice>}
          {!list.data ? <Loading /> : (
            <DataTable
              maxHeight={640}
              rows={list.data}
              onRowClick={(r) => setSel(r._id)}
              empty="No alerts match. Run the surveillance job first."
              columns={[
                { key: "severity", render: (r) => <Badge value={r.severity} /> },
                { key: "type", render: (r) => <span className="text-xs font-medium text-slate-600">{r.type.replace("_", " ")}</span> },
                { key: "title", render: (r) => <span className="block max-w-md truncate" title={r.title}>{r.title}</span> },
                { key: "trade_date", label: "Date" },
                { key: "status", render: (r) => <Badge value={r.status} /> },
              ]}
            />
          )}
        </Card>
        <div className="min-w-0">{sel ? <AlertDetail id={sel} onChanged={list.reload} /> : (
          <Card><p className="py-8 text-center text-sm text-slate-400">Select an alert to review it</p></Card>
        )}</div>
      </div>
    </Page>
  );
}

function AlertDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, reload } = useApi<Detail>(`/api/alerts/${id}`);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string>();

  async function setStatus(status: string) {
    try {
      await api(`/api/alerts/${id}`, { method: "PATCH", json: { status } });
      reload();
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/alerts/${id}/notes`, { method: "POST", json: { note } });
      setNote("");
      reload();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Loading /></Card>;
  const a = data.alert;
  return (
    <Card className="lg:sticky lg:top-16"
      title={<span className="flex items-center gap-2"><Badge value={a.severity} /> {a.type.replace("_", " ")}</span>}
      subtitle={`From ${a.source_query} · created ${fmtTs(a.created_at)}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-800">{a.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Status</span> <Badge value={a.status} />
          {a.reviewed_by && <span className="text-xs text-slate-400">by {a.reviewed_by}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={a.status === "UNDER_REVIEW"} onClick={() => setStatus("UNDER_REVIEW")}>Start review</Button>
          <Button variant="danger" disabled={a.status === "ESCALATED"} onClick={() => setStatus("ESCALATED")}>Escalate</Button>
          <Button variant="ghost" disabled={a.status === "DISMISSED"} onClick={() => setStatus("DISMISSED")}>Dismiss</Button>
          {a.status !== "OPEN" && <Button variant="ghost" onClick={() => setStatus("OPEN")}>Reopen</Button>}
        </div>
        {msg && <Notice>{msg}</Notice>}
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Evidence (query row)</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs">
            {Object.entries(a.details).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k.replaceAll("_", " ")}</dt>
                <dd className="break-all tabular-nums text-slate-800">{fmtCell(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Case notes</h3>
          <ul className="mb-2 space-y-2">
            {data.notes.map((n) => (
              <li key={n._id} className="rounded-lg border border-slate-200 p-2 text-sm">
                <div className="mb-0.5 text-xs text-slate-500">{n.author} · {fmtTs(n.created_at)}</div>
                {n.note}
              </li>
            ))}
            {!data.notes.length && <li className="text-sm text-slate-400">No notes yet</li>}
          </ul>
          <form onSubmit={addNote} className="flex gap-2">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a case note…" />
            <Button disabled={!note.trim()}>Add</Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
