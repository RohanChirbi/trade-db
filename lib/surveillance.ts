// Surveillance job: runs the Postgres detection queries and writes alerts into MongoDB.
//   Q15 large orders, Q16 spoofing, Q17 volume spikes, Q18 turnover, Q10 wide spreads, Q20 composite screen.
// Alerts are upserted on a stable key, so re-running never duplicates and never resets a reviewed status.
import { dbRo } from "./db";
import { mongo } from "./mongo";
import { getQuery, executable } from "./queries";
import type { AnyBulkWriteOperation } from "mongodb";

type Row = Record<string, unknown>;
type Alert = {
  key: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  ticker: string | null;
  strategy_id: number | null;
  strategy?: string | null;
  trade_date: string | null;
  source_query: string;
  details: Row;
};

const istDate = (v: unknown) =>
  v instanceof Date ? v.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : String(v).slice(0, 10);

const RULES: { query: string; map: (r: Row) => Alert }[] = [
  {
    query: "q15",
    map: (r) => ({
      key: `LARGE_ORDER:${r.order_id}`,
      type: "LARGE_ORDER",
      severity: Number(r.size_multiple) >= 15 ? "HIGH" : "MEDIUM",
      title: `Order ${r.order_id}: ${r.side} ${r.quantity} ${r.ticker} is ${r.size_multiple}x the average size`,
      ticker: r.ticker as string,
      strategy_id: Number(r.strategy_id),
      strategy: r.strategy as string,
      trade_date: istDate(r.submitted_ts),
      source_query: "Q15",
      details: r,
    }),
  },
  {
    query: "q16",
    map: (r) => ({
      key: `SPOOFING:${r.strategy_id}:${r.ticker}:${r.trade_date}`,
      type: "SPOOFING",
      severity: "HIGH",
      title: `${r.strategy} cancelled ${r.quick_cancels} large ${r.ticker} orders within ${r.avg_seconds_to_cancel}s on average`,
      ticker: r.ticker as string,
      strategy_id: Number(r.strategy_id),
      strategy: r.strategy as string,
      trade_date: String(r.trade_date),
      source_query: "Q16",
      details: r,
    }),
  },
  {
    query: "q17",
    map: (r) => ({
      key: `VOLUME_SPIKE:${r.ticker}:${r.hour_ist}`,
      type: "VOLUME_SPIKE",
      severity: Number(r.multiple) >= 25 ? "HIGH" : "MEDIUM",
      title: `${r.ticker} traded ${r.volume} shares in one hour, ${r.multiple}x its hourly average`,
      ticker: r.ticker as string,
      strategy_id: null,
      trade_date: String(r.trade_date),
      source_query: "Q17",
      details: r,
    }),
  },
  {
    query: "q18",
    map: (r) => ({
      key: `TURNOVER:${r.strategy_id}:${r.trade_date}`,
      type: "TURNOVER",
      severity: Number(r.turnover_pct) >= 25 ? "HIGH" : "MEDIUM",
      title: `${r.strategy} traded ${r.turnover_pct}% of its capital in one day`,
      ticker: null,
      strategy_id: Number(r.strategy_id),
      strategy: r.strategy as string,
      trade_date: String(r.trade_date),
      source_query: "Q18",
      details: r,
    }),
  },
  {
    query: "q10",
    map: (r) => ({
      key: `WIDE_SPREAD:${r.ticker}:${r.trade_date}`,
      type: "WIDE_SPREAD",
      severity: "LOW",
      title: `${r.ticker} spread ${r.spread_bps} bps, ${r.multiple}x its typical ${r.typical_bps} bps`,
      ticker: r.ticker as string,
      strategy_id: null,
      trade_date: String(r.trade_date),
      source_query: "Q10",
      details: r,
    }),
  },
  {
    query: "q20",
    map: (r) => ({
      key: `MULTI_FLAG:${r.ticker}:${r.trade_date}`,
      type: "MULTI_FLAG",
      severity: Number(r.flags) >= 3 ? "HIGH" : "MEDIUM",
      title: `${r.ticker} tripped ${r.flags} checks (move ${r.price_move_pct}%, cancel rate ${r.cancel_rate}, ${r.large_orders} large orders, ${r.spike_hours} spike hours)`,
      ticker: r.ticker as string,
      strategy_id: null,
      trade_date: String(r.trade_date),
      source_query: "Q20",
      details: r,
    }),
  },
];

export async function runSurveillance(runBy: string) {
  const db = await mongo();
  const runId = new Date().toISOString();
  const counts: Record<string, { found: number; new: number }> = {};

  for (const rule of RULES) {
    const q = await getQuery(rule.query);
    if (!q) throw new Error(`query ${rule.query} not found`);
    const { rows } = await dbRo.query(executable(q));
    const alerts = rows.map(rule.map);
    const now = new Date();
    const ops: AnyBulkWriteOperation[] = alerts.map((a) => ({
      updateOne: {
        filter: { key: a.key },
        update: {
          $set: { ...a, details: JSON.parse(JSON.stringify(a.details)), last_run_id: runId, updated_at: now },
          $setOnInsert: { status: "OPEN", created_at: now, created_by: runBy },
        },
        upsert: true,
      },
    }));
    const res = ops.length ? await db.collection("alerts").bulkWrite(ops, { ordered: false }) : null;
    counts[q.id.toUpperCase()] = { found: alerts.length, new: res?.upsertedCount ?? 0 };
  }
  return { runId, counts };
}
