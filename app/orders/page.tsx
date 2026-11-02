"use client";
import { useMemo, useState } from "react";
import { useMe } from "../components/session";
import { api, Badge, Button, Card, DataTable, Field, fmtNum, fmtTs, inputCls, Loading, Notice, Page, Select, useApi } from "../components/ui";

type Meta = {
  securities: { ticker: string; company_name: string }[];
  strategies: { strategy_id: number; name: string }[];
  quotes: { ticker: string; bid_price: string; ask_price: string; last_price: string; quote_ts: string }[];
};
type OrderRow = Record<string, unknown> & { order_id: string; status: string; strategy_id: number };
type Detail = { order: Record<string, unknown>; fills: Record<string, unknown>[]; events: Record<string, unknown>[] };

export default function OrdersPage() {
  const me = useMe();
  const meta = useApi<Meta>("/api/meta");
  const [filters, setFilters] = useState({ status: "", ticker: "", side: "", strategy: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const qs = useMemo(() => {
    const p = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    p.set("page", String(page));
    return p.toString();
  }, [filters, page]);
  const orders = useApi<{ rows: OrderRow[]; total: number; pageSize: number }>(`/api/orders?${qs}`);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useApi<Detail>(detailId ? `/api/orders/${detailId}` : null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string }>();

  const setF = (k: keyof typeof filters) => (v: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };
  const trader = me?.role === "TRADER";

  async function cancel(id: string) {
    setMsg(undefined);
    try {
      await api(`/api/orders/${id}/cancel`, { method: "POST" });
      setMsg({ tone: "success", text: `Order ${id} cancelled` });
      orders.reload();
      if (detailId === id) detail.reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  const pages = orders.data ? Math.max(1, Math.ceil(orders.data.total / orders.data.pageSize)) : 1;

  return (
    <Page title="Orders" subtitle={trader ? `Submit and manage orders for ${me?.strategy?.name}` : "All strategies (read-only for compliance)"}>
      {trader && meta.data && (
        <OrderForm meta={meta.data} onDone={(text, ok) => {
          setMsg({ tone: ok ? "success" : "error", text });
          if (ok) { setPage(1); orders.reload(); }
        }} />
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Card title="Order blotter" subtitle={orders.data ? `${fmtNum(orders.data.total)} orders match` : undefined}>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <Select value={filters.status} onChange={setF("status")} placeholder="Any status" options={["OPEN", "PARTIAL", "FILLED", "CANCELLED"]} />
          <Select value={filters.ticker} onChange={setF("ticker")} placeholder="Any security" options={meta.data?.securities.map((s) => s.ticker) ?? []} />
          <Select value={filters.side} onChange={setF("side")} placeholder="Buy and sell" options={["BUY", "SELL"]} />
          {!trader ? (
            <Select value={filters.strategy} onChange={setF("strategy")} placeholder="All strategies"
              options={meta.data?.strategies.map((s) => ({ value: String(s.strategy_id), label: s.name })) ?? []} />
          ) : <div className="hidden md:block" />}
          <input type="date" className={inputCls} value={filters.from} onChange={(e) => setF("from")(e.target.value)} title="From date" />
          <input type="date" className={inputCls} value={filters.to} onChange={(e) => setF("to")(e.target.value)} title="To date" />
        </div>
        {orders.error && <Notice>{orders.error}</Notice>}
        {!orders.data ? <Loading /> : (
          <>
            <DataTable
              rows={orders.data.rows}
              onRowClick={(r) => setDetailId(String(r.order_id))}
              columns={[
                { key: "order_id", label: "Order" },
                ...(!trader ? [{ key: "strategy" }] : []),
                { key: "ticker" },
                { key: "side", render: (r) => <Badge value={String(r.side)} /> },
                { key: "order_type", label: "Type" },
                { key: "quantity", label: "Qty" },
                { key: "limit_price", label: "Limit" },
                { key: "filled_qty", label: "Filled" },
                { key: "avg_fill_price", label: "Avg fill" },
                { key: "status", render: (r) => <Badge value={r.status} /> },
                { key: "submitted_ts", label: "Submitted", render: (r) => fmtTs(r.submitted_ts) },
                ...(trader ? [{
                  key: "_actions", label: "",
                  render: (r: OrderRow) => ["OPEN", "PARTIAL"].includes(r.status) ? (
                    <Button variant="danger" className="!py-0.5 text-xs" onClick={(e) => { e.stopPropagation(); cancel(r.order_id); }}>Cancel</Button>
                  ) : null,
                }] : []),
              ]}
            />
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>Page {page} of {fmtNum(pages)}</span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {detailId && (
        <Card title={`Order ${detailId}`} actions={<Button variant="ghost" onClick={() => setDetailId(null)}>Close</Button>}>
          {!detail.data ? <Loading /> : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Fills (execution)</h3>
                <DataTable rows={detail.data.fills} empty="No fills" />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Lifecycle (order_event)</h3>
                <DataTable rows={detail.data.events} />
              </div>
            </div>
          )}
        </Card>
      )}
    </Page>
  );
}

function OrderForm({ meta, onDone }: { meta: Meta; onDone: (msg: string, ok: boolean) => void }) {
  const [f, setF] = useState({ ticker: meta.securities[0]?.ticker ?? "", side: "BUY", order_type: "MARKET", quantity: "100", limit_price: "" });
  const [busy, setBusy] = useState(false);
  const q = meta.quotes.find((x) => x.ticker === f.ticker);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ order_id: string; status: string; filled_qty: number; fill_price: string | null }>("/api/orders", {
        method: "POST",
        json: { ...f, quantity: Number(f.quantity), limit_price: f.order_type === "LIMIT" ? Number(f.limit_price) : null },
      });
      onDone(
        r.filled_qty
          ? `Order ${r.order_id} ${r.status}: ${r.filled_qty} filled at ₹${fmtNum(r.fill_price)} — order, fill and position updated in one transaction`
          : `Order ${r.order_id} is ${r.status} (limit not marketable against the latest quote)`,
        true,
      );
    } catch (err) {
      onDone(`Rejected by the database: ${(err as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New order" subtitle="Calls submit_order(): pre-trade risk check, order + SUBMITTED event, and an immediate fill when marketable — atomically">
      <form onSubmit={submit} className="grid grid-cols-2 items-end gap-3 md:grid-cols-7">
        <Field label="Security">
          <Select value={f.ticker} onChange={set("ticker")} options={meta.securities.map((s) => ({ value: s.ticker, label: `${s.ticker} · ${s.company_name}` }))} />
        </Field>
        <Field label="Side"><Select value={f.side} onChange={set("side")} options={["BUY", "SELL"]} /></Field>
        <Field label="Type"><Select value={f.order_type} onChange={set("order_type")} options={["MARKET", "LIMIT"]} /></Field>
        <Field label="Quantity"><input className={inputCls} type="number" min={1} step={1} value={f.quantity} onChange={(e) => set("quantity")(e.target.value)} /></Field>
        <Field label="Limit price">
          <input className={inputCls} type="number" step="0.05" disabled={f.order_type !== "LIMIT"} value={f.limit_price}
            placeholder={f.order_type === "LIMIT" ? q?.last_price : "market"} onChange={(e) => set("limit_price")(e.target.value)} />
        </Field>
        <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600 md:col-span-1">
          {q ? <>Bid <b>{fmtNum(q.bid_price)}</b> · Ask <b>{fmtNum(q.ask_price)}</b></> : "No quote"}
        </div>
        <Button disabled={busy}>{busy ? "Submitting…" : "Submit order"}</Button>
      </form>
    </Card>
  );
}
