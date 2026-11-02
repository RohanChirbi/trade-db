# Data provenance (seed=42)
| Table | Origin |
|---|---|
| security | Real tickers and prev_close from Yahoo Finance; sector/exchange assigned manually |
| market_quote | Real daily OHLC; intraday path, spread and sizes synthetic |
| strategy, orders, order_event, execution | Synthetic, plus a few planted anomalies (10 large orders, 6 spoofing bursts) for surveillance |
| position, risk_metric | Derived from synthetic executions, marked at real closes |
| app_user | Seeded separately by the seed script |
