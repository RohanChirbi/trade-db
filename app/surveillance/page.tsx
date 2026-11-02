"use client";
import Link from "next/link";
import { useState } from "react";
import { api, BarList, Button, Card, DataTable, fmtNum, fmtTs, inputCls, Loading, Notice, Page, Stat, useApi } from "../components/ui";

type Bucket = { _id: string; total: number; open?: number; high?: number };
type Summary = {
  byType: Bucket[]; byStatus: Bucket[]; bySeverity: Bucket[]; byMonth: Bucket[]; bySecurity: Bucket[];
  topStrategies: { _id: { id: number; name: string }; total: number; types: string[] }[];
  lastRun: { last_run_id: string }[];
};
type Config = { param_name: string; param_value: string; description: string };
type RunResult = { runId: string; counts: Record<string, { found: number; new: number }> };

export default function SurveillancePage() {
  const summary = useApi<Summary>("/api/surveillance/summary");
  const config = useApi<Config[]>("/api/config");
  const auditLog = useApi<Record<string, unknown>[]>("/api/audit");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult>();
  const [error, setError] = useState<string>();

  async function runJob() {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await api<RunResult>("/api/surveillance/run", { method: "POST" }));
      summary.reload();
      auditLog.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = summary.data;
  const total = s?.byType.reduce((a, b) => a + b.total, 0) ?? 0;
  const open = s?.byStatus.find((b) => b._id === "OPEN")?.total ?? 0;
  const high = s?.bySeverity.find((b) => b._id === "HIGH")?.total ?? 0;

  return (
    <Page
      title="Surveillance"
      subtitle="Detection queries run in PostgreSQL; alerts, case notes and the audit log live in MongoDB"
      actions={<Button onClick={runJob} disabled={busy}>{busy ? "Running detection…" : "Run surveillance job"}</Button>}
    >
      {error && <Notice>{error}</Notice>}
      {result && (
        <Notice tone="success">
          Job finished. {Object.entries(result.counts).map(([q, c]) => `${q}: ${c.found} found (${c.new} new)`).join(" · ")}
        </Notice>
      )}
      {summary.error && <Notice>{summary.error}</Notice>}
      {!s ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Alerts" value={fmtNum(total)} hint={s.lastRun[0] ? `last run ${fmtTs(s.lastRun[0].last_run_id)}` : "job not run yet"} />
            <Stat label="Open" value={fmtNum(open)} hint={<Link className="text-indigo-600 hover:underline" href="/alerts">Review queue →</Link>} />
            <Stat label="High severity" value={fmtNum(high)} tone={high ? "text-rose-700" : ""} />
            <Stat label="Securities flagged" value={fmtNum(s.bySecurity.length)} />
          </div>
          {!total && <Notice tone="info">No alerts yet. Click <b>Run surveillance job</b> to run Q10, Q15–Q18 and Q20 and store the results as alerts.</Notice>}
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Alerts by type" subtitle="MongoDB $facet → $group">
              <BarList items={s.byType.map((b) => ({ label: b._id.replace("_", " "), value: b.total, extra: <span className="text-xs">({b.open} open)</span> }))} />
            </Card>
            <Card title="Alerts by security">
              <BarList color="#0284c7" items={s.bySecurity.map((b) => ({ label: b._id, value: b.total, extra: b.high ? <span className="text-xs text-rose-600">({b.high} high)</span> : null }))} />
            </Card>
            <Card title="Most flagged strategies">
              <BarList color="#e11d48" items={s.topStrategies.map((b) => ({ label: <>{b._id.name} <span className="text-xs text-slate-400">{b.types.join(", ")}</span></>, value: b.total }))} />
            </Card>
            <Card title="Alerts by month (trade date)">
              <BarList color="#059669" items={s.byMonth.map((b) => ({ label: b._id, value: b.total }))} />
            </Card>
          </div>
        </>
      )}

      <Card title="Detection thresholds" subtitle="surveillance_config in PostgreSQL. Changes are audited; re-run the job to apply them.">
        {!config.data ? <Loading /> : <ConfigTable rows={config.data} onSaved={() => { config.reload(); auditLog.reload(); }} />}
      </Card>

      <Card title="Audit log" subtitle="MongoDB audit_log: logins, order actions, alert reviews, config changes (latest 100)">
        {!auditLog.data ? <Loading /> : (
          <DataTable
            maxHeight={420}
            rows={auditLog.data}
            columns={[
              { key: "ts", label: "Time", render: (r) => fmtTs(r.ts) },
              { key: "username", label: "User" },
              { key: "role" },
              { key: "action" },
              { key: "details", render: (r) => <span className="font-mono text-xs text-slate-500">{JSON.stringify(r.details)}</span> },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}

function ConfigTable({ rows, onSaved }: { rows: Config[]; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string }>();
  async function save(name: string) {
    try {
      await api("/api/config", { method: "PATCH", json: { param_name: name, param_value: Number(edits[name]) } });
      setMsg({ tone: "success", text: `${name} updated` });
      setEdits((x) => {
        const next = { ...x };
        delete next[name];
        return next;
      });
      onSaved();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }
  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <DataTable
        rows={rows}
        columns={[
          { key: "param_name", label: "Parameter", render: (r) => <span className="font-mono text-xs">{r.param_name}</span> },
          { key: "description", render: (r) => <span className="whitespace-normal text-slate-600">{r.description}</span> },
          {
            key: "param_value", label: "Value", align: "right",
            render: (r) => (
              <div className="flex items-center justify-end gap-2">
                <input className={`${inputCls} !w-24 text-right`} type="number" step="0.05"
                  value={edits[r.param_name] ?? Number(r.param_value)} onChange={(e) => setEdits((x) => ({ ...x, [r.param_name]: e.target.value }))} />
                <Button variant="secondary" className="!py-1 text-xs" disabled={edits[r.param_name] === undefined} onClick={() => save(r.param_name)}>Save</Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
