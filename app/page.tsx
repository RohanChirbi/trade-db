"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useMe } from "./components/session";
import { Badge, Card, DataTable, fmtMoney, fmtNum, fmtTs, Legend, LineChart, Loading, Notice, Page, PALETTE, pnlClass, Stat, useApi, type Series } from "./components/ui";

type Overview = {
  totals: Record<string, string>;
  pnl: { strategy_id: number; name: string; trade_date: string; cum_pnl: string }[];
  recent: Record<string, unknown>[];
};

export default function Home() {
  const me = useMe();
  const { data, error } = useApi<Overview>("/api/overview");
  const series: Series[] = useMemo(() => {
    const by = new Map<string, Series>();
    for (const r of data?.pnl ?? []) {
      if (!by.has(r.name)) by.set(r.name, { name: r.name, color: PALETTE[(r.strategy_id - 1) % PALETTE.length], points: [] });
      by.get(r.name)!.points.push({ x: r.trade_date, y: Number(r.cum_pnl) });
    }
    return [...by.values()];
  }, [data]);

  if (error) return <Page title="Overview"><Notice>{error}</Notice></Page>;
  if (!data || !me) return <Loading />;
  const t = data.totals;
  const trader = me.role === "TRADER";

  return (
    <Page
      title={trader ? `${me.strategy?.name}` : "Firm overview"}
      subtitle={<>NSE equities · {t.first_day} to {t.last_day} · {trader ? "your strategy only" : "all strategies"}</>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cumulative P&L" value={fmtMoney(t.total_pnl)} tone={pnlClass(t.total_pnl)} hint="realised + unrealised" />
        <Stat label="Orders" value={fmtNum(t.orders)} hint={`${fmtNum(t.working_orders)} still working`} />
        <Stat label="Executions" value={fmtNum(t.executions)} />
        <Stat label="Market quotes" value={fmtNum(t.quotes)} hint={`${t.securities} securities`} />
      </div>

      <Card title="Cumulative P&L by strategy" subtitle="From risk_metric.daily_pnl with a running SUM window (Q13)" actions={<Legend series={series} />}>
        <LineChart series={series} height={300} />
      </Card>

      <Card title="Latest orders" actions={<Link href="/orders" className="text-sm font-medium text-indigo-600 hover:underline">All orders →</Link>}>
        <DataTable
          rows={data.recent}
          columns={[
            { key: "order_id", label: "Order" },
            { key: "strategy" },
            { key: "ticker" },
            { key: "side", render: (r) => <Badge value={String(r.side)} /> },
            { key: "order_type", label: "Type" },
            { key: "quantity", label: "Qty" },
            { key: "status", render: (r) => <Badge value={String(r.status)} /> },
            { key: "submitted_ts", label: "Submitted", render: (r) => fmtTs(r.submitted_ts) },
          ]}
        />
      </Card>
    </Page>
  );
}
