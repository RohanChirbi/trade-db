"use client";
import { useState } from "react";
import { useMe } from "../components/session";
import { Card, DataTable, fmtMoney, fmtNum, LineChart, Loading, Notice, Page, pnlClass, Select, Stat, useApi } from "../components/ui";

type Data = { positions: Record<string, unknown>[]; risk: Record<string, string>[]; history: { trade_date: string; daily_pnl: string; cum_pnl: string; gross_exposure: string }[] };

export default function PositionsPage() {
  const me = useMe();
  const [strategy, setStrategy] = useState("");
  const strategies = useApi<{ strategies: { strategy_id: number; name: string }[] }>(me?.role === "COMPLIANCE" ? "/api/meta" : null);
  const { data, error } = useApi<Data>(`/api/positions${strategy ? `?strategy=${strategy}` : ""}`);

  if (error) return <Page title="Positions & P&L"><Notice>{error}</Notice></Page>;
  const totals = data?.positions.reduce<{ mv: number; unreal: number; real: number }>(
    (a, p) => ({ mv: a.mv + Math.abs(Number(p.market_value)), unreal: a.unreal + Number(p.unrealised_pnl), real: a.real + Number(p.total_realised_pnl) }),
    { mv: 0, unreal: 0, real: 0 },
  );

  return (
    <Page
      title="Positions & P&L"
      subtitle="End-of-day position snapshots (position), marked to the latest traded price (v_current_position)"
      actions={me?.role === "COMPLIANCE" && (
        <div className="w-56">
          <Select value={strategy} onChange={setStrategy} placeholder="All strategies"
            options={strategies.data?.strategies.map((s) => ({ value: String(s.strategy_id), label: s.name })) ?? []} />
        </div>
      )}
    >
      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Gross market value" value={fmtMoney(totals!.mv)} />
            <Stat label="Unrealised P&L" value={fmtMoney(totals!.unreal)} tone={pnlClass(totals!.unreal)} />
            <Stat label="Realised P&L (to date)" value={fmtMoney(totals!.real)} tone={pnlClass(totals!.real)} />
            <Stat label="Open positions" value={fmtNum(data.positions.length)} />
          </div>

          <Card title="Cumulative P&L" subtitle="Running total of daily P&L (realised + change in unrealised)">
            <LineChart series={[{ name: "Cumulative P&L", points: data.history.map((h) => ({ x: h.trade_date, y: Number(h.cum_pnl) })) }]} />
          </Card>

          <Card title="Open positions">
            <DataTable
              rows={data.positions}
              columns={[
                ...(me?.role === "COMPLIANCE" ? [{ key: "strategy" }] : []),
                { key: "ticker" },
                { key: "quantity", label: "Qty" },
                { key: "avg_entry_price", label: "Avg entry" },
                { key: "last_price", label: "Last" },
                { key: "market_value", label: "Market value", render: (r) => fmtMoney(r.market_value), align: "right" },
                { key: "unrealised_pnl", label: "Unrealised", render: (r) => <span className={pnlClass(r.unrealised_pnl)}>{fmtMoney(r.unrealised_pnl)}</span>, align: "right" },
                { key: "total_realised_pnl", label: "Realised", render: (r) => <span className={pnlClass(r.total_realised_pnl)}>{fmtMoney(r.total_realised_pnl)}</span>, align: "right" },
                { key: "as_of", label: "As of" },
              ]}
            />
          </Card>

          <Card title="Latest risk metrics" subtitle="risk_metric, last trading day per strategy">
            <DataTable
              rows={data.risk}
              columns={[
                { key: "strategy" },
                { key: "trade_date", label: "Date" },
                { key: "gross_exposure", label: "Gross exposure", render: (r) => fmtMoney(r.gross_exposure), align: "right" },
                { key: "net_exposure", label: "Net exposure", render: (r) => fmtMoney(r.net_exposure), align: "right" },
                { key: "daily_pnl", label: "Daily P&L", render: (r) => <span className={pnlClass(r.daily_pnl)}>{fmtMoney(r.daily_pnl)}</span>, align: "right" },
                { key: "max_position_value", label: "Largest position", render: (r) => fmtMoney(r.max_position_value), align: "right" },
                { key: "available_capital", label: "Available capital", render: (r) => fmtMoney(r.available_capital), align: "right" },
                { key: "util", label: "Utilisation", render: (r) => `${fmtNum((100 * Number(r.gross_exposure)) / Number(r.assigned_capital), 1)}%`, align: "right" },
              ]}
            />
          </Card>
        </>
      )}
    </Page>
  );
}
