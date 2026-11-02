"use client";
import { useState } from "react";
import { Card, DataTable, fmtNum, Legend, LineChart, Loading, Notice, Page, Select, useApi } from "../components/ui";

type Data = { ticker: string; spread: Record<string, unknown>[]; vwap: { trade_date: string; vwap: string; close_price: string; volume: string }[]; slippage: Record<string, unknown>[] };

export default function AnalyticsPage() {
  const [ticker, setTicker] = useState("RELIANCE.NS");
  const meta = useApi<{ securities: { ticker: string }[] }>("/api/meta");
  const { data, error } = useApi<Data>(`/api/analytics?ticker=${ticker}`);
  const series = data ? [
    { name: "VWAP (our fills)", color: "#4f46e5", points: data.vwap.map((r) => ({ x: r.trade_date, y: Number(r.vwap) })) },
    { name: "Close", color: "#94a3b8", points: data.vwap.filter((r) => r.close_price).map((r) => ({ x: r.trade_date, y: Number(r.close_price) })) },
  ] : [];

  return (
    <Page title="Analytics" subtitle="Spread, VWAP and execution slippage">
      {error && <Notice>{error}</Notice>}
      {!data ? <Loading /> : (
        <>
          <Card title="Bid-ask spread by security (Q01)" subtitle="Average quoted spread in rupees and basis points of mid">
            <DataTable rows={data.spread} />
          </Card>
          <Card title="Daily VWAP vs closing price (Q02)" subtitle="Last 120 days of executions"
            actions={<div className="flex items-center gap-4"><Legend series={series} /><div className="w-44">
              <Select value={ticker} onChange={setTicker} options={meta.data?.securities.map((s) => s.ticker) ?? [ticker]} />
            </div></div>}>
            <LineChart series={series} zero={false} format={(v) => `₹${fmtNum(v, 0)}`} />
          </Card>
          <Card title="Slippage vs arrival mid (Q11)" subtitle="Positive = paid more than the mid quote when the order arrived (a cost)">
            <DataTable rows={data.slippage} />
          </Card>
        </>
      )}
    </Page>
  );
}
