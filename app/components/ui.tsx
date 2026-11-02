"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// ------------------------------------------------------------------ data fetching
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

/** Fetches url (re-fetches when it changes). Keeps the previous data while reloading. */
export function useApi<T>(url: string | null) {
  const [tick, setTick] = useState(0);
  const key = url ? `${url}#${tick}` : null;
  const [res, setRes] = useState<{ key: string | null; data?: T; error?: string }>({ key: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<T>(url)
      .then((data) => live && setRes({ key, data }))
      .catch((e: Error) => live && setRes((r) => ({ key, data: r.data, error: e.message })));
    return () => {
      live = false;
    };
  }, [url, key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: res.data, error: res.key === key ? res.error : undefined, loading: !!key && res.key !== key, reload };
}

// ------------------------------------------------------------------ formatting
const NUM = /^-?\d+(\.\d+)?$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export const fmtNum = (v: unknown, digits = 2) => {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || Number.isNaN(n)) return "—";
  const d = Number.isInteger(n) && digits === 2 ? 0 : digits;
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const fmtMoney = (v: unknown) => {
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};
export const fmtTs = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }) : "—";

export function fmtCell(v: unknown): ReactNode {
  if (v === null || v === undefined) return <span className="text-slate-400">—</span>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") return fmtNum(v, Number.isInteger(v) ? 0 : 4);
  const s = String(v);
  if (NUM.test(s)) {
    const decimals = s.includes(".") ? Math.min(s.split(".")[1].length, 4) : 0;
    return fmtNum(s, decimals);
  }
  if (ISO_TS.test(s)) return fmtTs(s);
  if (typeof v === "object") return JSON.stringify(v);
  return s;
}
const isNumeric = (v: unknown) => typeof v === "number" || (typeof v === "string" && NUM.test(v));
export const pnlClass = (v: unknown) => (Number(v) > 0 ? "text-emerald-700" : Number(v) < 0 ? "text-rose-700" : "");

// ------------------------------------------------------------------ layout pieces
export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums text-slate-900 ${tone ?? ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  FILLED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  OPEN: "bg-sky-50 text-sky-700 ring-sky-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
  BUY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SELL: "bg-rose-50 text-rose-700 ring-rose-200",
  HIGH: "bg-rose-50 text-rose-700 ring-rose-200",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-200",
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
  UNDER_REVIEW: "bg-violet-50 text-violet-700 ring-violet-200",
  ESCALATED: "bg-rose-50 text-rose-700 ring-rose-200",
  DISMISSED: "bg-slate-100 text-slate-500 ring-slate-200",
  TRADER: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  COMPLIANCE: "bg-violet-50 text-violet-700 ring-violet-200",
};
export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${BADGE[value] ?? "bg-slate-50 text-slate-700 ring-slate-200"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
    danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:text-rose-300",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`} {...p} />;
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const c = { error: "border-rose-200 bg-rose-50 text-rose-800", success: "border-emerald-200 bg-emerald-50 text-emerald-800", info: "border-sky-200 bg-sky-50 text-sky-800" }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <div className="py-8 text-center text-sm text-slate-400">{what}…</div>;
}

// ------------------------------------------------------------------ table
export type Column<T> = { key: string; label?: string; render?: (row: T) => ReactNode; align?: "left" | "right" };

export function DataTable<T extends Record<string, unknown>>({ rows, columns, onRowClick, empty = "No rows", maxHeight }: { rows: T[]; columns?: Column<T>[]; onRowClick?: (r: T) => void; empty?: string; maxHeight?: number }) {
  const cols: Column<T>[] = columns ?? (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k })) : []);
  if (!rows.length) return <div className="py-6 text-center text-sm text-slate-400">{empty}</div>;
  const right = (c: Column<T>) => c.align === "right" || (!c.align && !c.render && rows.slice(0, 5).some((r) => isNumeric(r[c.key])));
  return (
    <div className="overflow-auto rounded-lg border border-slate-200" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-medium ${right(c) ? "text-right" : "text-left"}`}>
                {c.label ?? c.key.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`${onRowClick ? "cursor-pointer hover:bg-indigo-50/50" : "hover:bg-slate-50"}`}>
              {cols.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-800 ${right(c) ? "text-right" : ""}`}>
                  {c.render ? c.render(r) : fmtCell(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ charts (plain SVG)
export const PALETTE = ["#4f46e5", "#059669", "#d97706", "#e11d48", "#0284c7", "#7c3aed"];
export type Series = { name: string; color?: string; points: { x: string; y: number }[] };

export function LineChart({ series, height = 260, format = fmtMoney, zero = true }: { series: Series[]; height?: number; format?: (v: number) => string; zero?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  if (!xs.length) return <div ref={ref} className="py-6 text-center text-sm text-slate-400">No data</div>;
  // zero=true keeps 0 on the axis (P&L); zero=false fits the data with 5% padding (prices)
  const min = Math.min(...all), max = Math.max(...all), padY = zero ? 0 : (max - min) * 0.05 || 1;
  const lo = zero ? Math.min(0, min) : min - padY;
  let hi = zero ? Math.max(0, max) : max + padY;
  if (lo === hi) hi = lo + 1;
  const pad = { l: 72, r: 12, t: 10, b: 24 };
  const w = Math.max(width, 200), h = height;
  const xi = new Map(xs.map((x, i) => [x, i]));
  const X = (x: string) => pad.l + ((xi.get(x) ?? 0) / Math.max(1, xs.length - 1)) * (w - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const hx = hover !== null ? xs[hover] : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={h} className="block select-none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const f = (e.clientX - r.left - pad.l) / (w - pad.l - pad.r);
          setHover(Math.max(0, Math.min(xs.length - 1, Math.round(f * (xs.length - 1)))));
        }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="#e2e8f0" />
            <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{format(t)}</text>
          </g>
        ))}
        {lo < 0 && hi > 0 && <line x1={pad.l} x2={w - pad.r} y1={Y(0)} y2={Y(0)} stroke="#94a3b8" strokeDasharray="3 3" />}
        <text x={pad.l} y={h - 6} fontSize="11" fill="#64748b">{xs[0]}</text>
        <text x={w - pad.r} y={h - 6} fontSize="11" fill="#64748b" textAnchor="end">{xs[xs.length - 1]}</text>
        {series.map((s, i) => (
          <path key={s.name} fill="none" stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={1.75}
            d={s.points.map((p, j) => `${j ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("")} />
        ))}
        {hx && <line x1={X(hx)} x2={X(hx)} y1={pad.t} y2={h - pad.b} stroke="#94a3b8" />}
      </svg>
      {hx && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(X(hx) + 10, w - 200) }}>
          <div className="mb-1 font-medium text-slate-700">{hx}</div>
          {series.map((s, i) => {
            const p = s.points.find((q) => q.x === hx);
            return p ? (
              <div key={s.name} className="flex items-center gap-2 tabular-nums">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />
                <span className="text-slate-500">{s.name}</span>
                <span className="ml-auto font-medium text-slate-800">{format(p.y)}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: { name: string; color?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s, i) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export function BarList({ items, color = "#4f46e5", format = (v: number) => fmtNum(v, 0) }: { items: { label: ReactNode; value: number; extra?: ReactNode }[]; color?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="py-4 text-center text-sm text-slate-400">No data yet</div>;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="text-sm">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-slate-700">{it.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{format(it.value)} {it.extra}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(100 * it.value) / max}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
