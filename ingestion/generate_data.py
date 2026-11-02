import numpy as np, pandas as pd
from pathlib import Path
from datetime import datetime, timedelta, timezone

SEED = 42
rng = np.random.default_rng(SEED)
IST = timezone(timedelta(hours=5, minutes=30))
# Paths are relative to the repo root, so this runs from any directory.
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/daily_prices.csv"
OUT = ROOT / "data/generated"; OUT.mkdir(parents=True, exist_ok=True)
TICK, EXCHANGE = 0.05, "NSE"

META = {  # extend for every ticker you downloaded
    "RELIANCE.NS": ("Reliance Industries", "Energy"),
    "TCS.NS": ("Tata Consultancy Services", "IT"),
    "INFY.NS": ("Infosys", "IT"),
    "HDFCBANK.NS": ("HDFC Bank", "Financials"),
    "ICICIBANK.NS": ("ICICI Bank", "Financials"),
}

def rnd(x): return max(round(round(x / TICK) * TICK, 4), TICK)

if not RAW.exists():
    raise SystemExit(f"{RAW} not found - run ingestion/download_prices.py first")
px = pd.read_csv(RAW, parse_dates=["date"])
px = px.dropna(subset=["open", "high", "low", "close"]).sort_values(["ticker", "date"])
tickers = sorted(px.ticker.unique())
dates = sorted(px.date.unique())

# ---- security (real prices, labelled metadata) ----
last = px.groupby("ticker").close.last()
security = [(t, *META.get(t, (t, "Other")), EXCHANGE, TICK, round(float(last[t]), 4)) for t in tickers]

# ---- strategy (synthetic) ----
types = ["MOMENTUM", "MEAN_REVERSION", "MARKET_MAKING", "ARBITRAGE", "STAT_ARB"]
strategy = [(i + 1, f"{t.title().replace('_', ' ')} Alpha", t, 50_000_000.00) for i, t in enumerate(types)]
pools = {s[0]: [str(x) for x in rng.choice(tickers, size=min(3, len(tickers)), replace=False)] for s in strategy}

# ---- market_quote (real close path + synthetic spread) ----
QT = [(9, 20), (10, 30), (11, 45), (13, 0), (14, 15), (15, 20)]
quotes, dayq = [], {}
for r in px.itertuples():
    path = np.linspace(r.open, r.close, len(QT)) + rng.normal(0, 0.002 * r.close, len(QT))
    path = np.clip(path, r.low, r.high); path[-1] = r.close
    for (h, m), lp in zip(QT, path):
        ts = datetime(r.date.year, r.date.month, r.date.day, h, m, tzinfo=IST)
        lp = rnd(lp); half = rnd(lp * rng.uniform(0.0002, 0.0008))
        bid, ask = rnd(lp - half), rnd(lp + half)
        quotes.append((r.ticker, ts, bid, int(rng.integers(100, 5000)), ask, int(rng.integers(100, 5000)), lp))
        dayq.setdefault((r.ticker, r.date), []).append((ts, lp))
quotes.sort(key=lambda q: (q[1], q[0]))
quotes = [(i + 1, *q) for i, q in enumerate(quotes)]

# ---- orders / fills (synthetic) ----
def split(total, n):
    n = max(1, min(n, total)); parts, rem = [], total
    for i in range(n):
        q = rem if i == n - 1 else int(rng.integers(1, rem - (n - i - 1) + 1))
        parts.append(q); rem -= q
    return parts

raw = []
for d in dates:
    cap = datetime(d.year, d.month, d.day, 15, 29, 59, tzinfo=IST)
    for s in strategy:
        sid = s[0]
        for _ in range(int(rng.integers(2, 7))):
            t = str(rng.choice(pools[sid]))
            if (t, d) not in dayq: continue
            qs = dayq[(t, d)]
            qts, qlast = qs[int(rng.integers(0, len(qs) - 1))]
            sub = qts + timedelta(seconds=int(rng.integers(0, 600)))
            side = str(rng.choice(["BUY", "SELL"]))
            qty = int(rng.choice([10, 25, 50, 100, 200, 500]))
            is_limit = rng.random() < 0.6
            lim = rnd(qlast * (1 + rng.uniform(-0.003, 0.004) * (1 if side == "BUY" else -1))) if is_limit else None
            outcome = str(rng.choice(["FILLED", "PARTIAL", "CANCELLED", "OPEN"], p=[.6, .15, .15, .10]))
            if outcome == "FILLED": parts = split(qty, int(rng.integers(1, 5)))
            elif outcome == "PARTIAL" or (outcome == "CANCELLED" and rng.random() < 0.5):
                parts = split(int(qty * rng.uniform(0.2, 0.8)), int(rng.integers(1, 4)))
            else: parts = []
            fills, ts = [], sub
            for q in parts:
                ts = min(ts + timedelta(seconds=int(rng.integers(1, 1200))), cap)
                ref = qlast * (1 + rng.normal(0, 0.0015))
                if is_limit: ref = min(ref, lim) if side == "BUY" else max(ref, lim)
                fills.append((q, rnd(ref), ts))
            cancel = None
            if outcome == "CANCELLED":
                cancel = (fills[-1][2] if fills else sub) + timedelta(seconds=int(rng.integers(1, 600)))
            raw.append(dict(sid=sid, t=t, side=side, type="LIMIT" if is_limit else "MARKET",
                            qty=qty, lim=lim, sub=sub, status=outcome, fills=fills, cancel=cancel, d=d))

# ---- planted anomalies, so the surveillance queries (Q15-Q18, Q20) have known cases to find ----
# Drawn after the normal orders, so the base dataset above is unchanged.
def pick(sid):
    while True:
        d = dates[int(rng.integers(0, len(dates)))]
        t = pools[sid][int(rng.integers(0, len(pools[sid])))]
        if (t, d) in dayq:
            qts, qlast = dayq[(t, d)][int(rng.integers(0, len(dayq[(t, d)]) - 1))]
            return d, t, qts, qlast, datetime(d.year, d.month, d.day, 15, 29, 59, tzinfo=IST)

# large market orders worked in a burst of child fills (large order, volume spike, turnover)
for _ in range(10):
    sid = int(rng.integers(1, len(strategy) + 1))
    d, t, qts, qlast, cap = pick(sid)
    qty = int(rng.integers(20, 61)) * 100
    sub = qts + timedelta(seconds=int(rng.integers(0, 300)))
    fills, ts = [], sub
    for q in split(qty, int(rng.integers(3, 7))):
        ts = min(ts + timedelta(seconds=int(rng.integers(5, 90))), cap)
        fills.append((q, rnd(qlast * (1 + rng.normal(0, 0.001))), ts))
    raw.append(dict(sid=sid, t=t, side=str(rng.choice(["BUY", "SELL"])), type="MARKET", qty=qty, lim=None,
                    sub=sub, status="FILLED", fills=fills, cancel=None, d=d))

# spoofing: bursts of large limit orders away from the market, cancelled within seconds, never filled
for sid in [4, 4, 4, 4, 2, 2]:
    d, t, qts, qlast, cap = pick(sid)
    side = str(rng.choice(["BUY", "SELL"]))
    sub = qts
    for _ in range(int(rng.integers(4, 7))):
        sub = sub + timedelta(seconds=int(rng.integers(5, 40)))
        away = rng.uniform(0.003, 0.006) * (-1 if side == "BUY" else 1)
        raw.append(dict(sid=sid, t=t, side=side, type="LIMIT", qty=int(rng.integers(10, 31)) * 100,
                        lim=rnd(qlast * (1 + away)), sub=sub, status="CANCELLED", fills=[],
                        cancel=sub + timedelta(seconds=int(rng.integers(1, 8))), d=d))

raw.sort(key=lambda o: o["sub"])
orders, events, execs = [], [], []
for i, o in enumerate(raw, 1):
    o["id"] = i
    orders.append((i, o["sid"], o["t"], o["side"], o["type"], o["qty"], o["lim"], o["sub"], o["status"]))
    events.append((i, "SUBMITTED", o["sub"]))
    if o["cancel"]: events.append((i, "CANCELLED", o["cancel"]))
events = [(k + 1, *e) for k, e in enumerate(events)]
allf = sorted(((o["id"], *f) for o in raw for f in o["fills"]), key=lambda x: x[3])
execs = [(k + 1, *f) for k, f in enumerate(allf)]

# ---- position + risk_metric (derived from executions) ----
close = {(r.ticker, r.date): float(r.close) for r in px.itertuples()}
byday = {}
for o in raw:
    for q, p, ts in o["fills"]:
        byday.setdefault(o["d"], []).append((ts, o["sid"], o["t"], q if o["side"] == "BUY" else -q, p))
caps = {s[0]: s[3] for s in strategy}
state, last_close, last_unreal = {}, {}, {s[0]: 0.0 for s in strategy}
positions, risks = [], []
for d in dates:
    for t in tickers:
        if (t, d) in close: last_close[t] = close[(t, d)]
    realised = {}
    for ts, sid, t, sq, p in sorted(byday.get(d, [])):
        st = state.setdefault((sid, t), [0, 0.0])
        q, a = st
        if q == 0 or (q > 0) == (sq > 0):
            st[1] = (abs(q) * a + abs(sq) * p) / (abs(q) + abs(sq)); st[0] = q + sq
        else:
            closing = min(abs(sq), abs(q))
            realised[(sid, t)] = realised.get((sid, t), 0.0) + closing * (p - a) * (1 if q > 0 else -1)
            st[0] = q + sq
            if st[0] == 0: st[1] = 0.0
            elif (st[0] > 0) != (q > 0): st[1] = p
    for (sid, t), (q, a) in state.items():
        positions.append((sid, t, d.date(), int(q), round(a, 4) if q != 0 else None,
                          round(realised.get((sid, t), 0.0), 4)))
    for s in strategy:
        sid = s[0]
        mine = [(t, q, a) for (x, t), (q, a) in state.items() if x == sid]
        if not mine: continue
        vals = [(q * last_close[t], q, a, last_close[t]) for t, q, a in mine]
        gross = sum(abs(v[0]) for v in vals); net = sum(v[0] for v in vals)
        unreal = sum(q * (c - a) for _, q, a, c in vals if q != 0)
        rl = sum(v for (x, _), v in realised.items() if x == sid)
        risks.append((sid, d.date(), round(gross, 2), round(net, 2), round(rl + unreal - last_unreal[sid], 2),
                      round(max(abs(v[0]) for v in vals), 2), round(caps[sid] - gross, 2)))
        last_unreal[sid] = unreal

def dump(name, cols, rows):
    pd.DataFrame(rows, columns=cols).to_csv(OUT / f"{name}.csv", index=False)

dump("security", ["ticker","company_name","sector","exchange","tick_size","prev_close"], security)
dump("strategy", ["strategy_id","name","strategy_type","assigned_capital"], strategy)
dump("market_quote", ["quote_id","ticker","quote_ts","bid_price","bid_qty","ask_price","ask_qty","last_price"], quotes)
dump("orders", ["order_id","strategy_id","ticker","side","order_type","quantity","limit_price","submitted_ts","status"], orders)
dump("order_event", ["event_id","order_id","event_type","event_ts"], events)
dump("execution", ["execution_id","order_id","exec_qty","exec_price","exec_ts"], execs)
dump("position", ["strategy_id","ticker","trade_date","quantity","avg_entry_price","realised_pnl"], positions)
dump("risk_metric", ["strategy_id","trade_date","gross_exposure","net_exposure","daily_pnl","max_position_value","available_capital"], risks)

(ROOT / "data/PROVENANCE.md").write_text(f"""# Data provenance (seed={SEED})
| Table | Origin |
|---|---|
| security | Real tickers and prev_close from Yahoo Finance; sector/exchange assigned manually |
| market_quote | Real daily OHLC; intraday path, spread and sizes synthetic |
| strategy, orders, order_event, execution | Synthetic, plus a few planted anomalies (10 large orders, 6 spoofing bursts) for surveillance |
| position, risk_metric | Derived from synthetic executions, marked at real closes |
| app_user | Seeded separately by the seed script |
""")
print(f"wrote {len(orders)} orders, {len(execs)} executions, {len(quotes)} quotes to {OUT}")
