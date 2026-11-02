# Trade DB: quant trading database and market surveillance

A trading database for an NSE equities desk: market data, orders, fills, positions and risk in
**PostgreSQL**, and surveillance alerts, case notes and an audit log in **MongoDB**, behind a
**Next.js** app with two roles (Trader and Compliance).

- 5 real NSE securities with real daily prices (Yahoo Finance, 2023-01 to 2025-12), synthetic intraday
  quotes, and about 14,700 synthetic orders and 28,600 fills from 5 strategies (seeded, reproducible).
- 10 tables, 3 views, 6 stored functions, 2 triggers, 8 named indexes, 3 database roles.
- 20 analytical and surveillance queries (`sql/queries/q01…q20`) that the app runs unchanged.
- Planted anomalies (10 large orders, 6 spoofing bursts) that the surveillance queries find exactly.

## Quick start (this Mac, no Docker)

```bash
brew install postgresql@17          # once
npm install                         # also downloads the mongod 7.0 binary
cp .env.example .env.local          # then replace every CHANGE_ME (already done on this machine)
npm run db:up                       # starts Postgres + MongoDB; first run builds the schema and loads the data
npm run dev                         # http://localhost:3000
```

`npm run db:down` stops both databases, and `npm run db:reset` wipes them and rebuilds from scratch
(about 30 seconds). Data lives in `.localdb/` (gitignored).

**Logins:** `trader1` … `trader5` (one per strategy) with `SEED_TRADER_PASSWORD`, and `compliance`
with `SEED_ADMIN_PASSWORD`, both from `.env.local`.

## Quick start (Docker)

```bash
cp .env.example .env.local          # fill in every CHANGE_ME
docker compose --env-file .env.local up -d
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python3 ingestion/download_prices.py && python3 ingestion/generate_data.py
sh ingestion/load_data.sh
npm install && npm run dev
```

The `sql/0*` scripts run only when the Postgres volume is empty. After changing them, recreate it
with `docker compose --env-file .env.local down -v`.

## Repository map

| Path | What it is |
|---|---|
| `sql/01_schema.sql` | Tables, primary and foreign keys, CHECK constraints |
| `sql/02_indexes.sql` | Indexes, each tied to the queries it serves |
| `sql/03_roles.sh` | `trading_app` (read/write, no DDL) and `trading_readonly` (no access to password hashes) |
| `sql/04_config.sql` | Surveillance thresholds (`surveillance_config`), tunable from the app |
| `sql/05_views.sql` | `v_eod_price`, `v_position_valued`, `StrategyPerformance` |
| `sql/06_procedures.sql` | Triggers, `place_order`, `record_execution`, `cancel_order`, `submit_order`, `correct_execution`, `v_current_position` |
| `sql/queries/` | Q01-Q20, one file each |
| `sql/demo/advanced_features_demo.sql` | Scripted demo of triggers, transactions, UPDATE/DELETE flows and EXPLAIN (rolls back) |
| `sql/migrations/001_alter_drop_demo.sql` | ALTER and DROP demonstration |
| `ingestion/` | Price download, data generator, bulk loader, user seeding, sanity checks |
| `lib/`, `app/api/` | Database access, auth, MongoDB setup, surveillance job, 20 Route Handlers |
| `app/*/page.tsx` | Overview, Schema, Orders, Positions & P&L, Analytics, Surveillance, Alert review, Queries |
| `tests/` | `run_tests.mjs` (30 cases) and `validate_pandas.py` (Q01, Q02, Q04, Q13 cross-check) |
| `docs/` | ER diagram source, test results, pandas cross-check, presentation script |

## Design decisions

- **Order lifecycle.** `orders.status` holds the current state; `order_event` records when an order was
  submitted and cancelled (cancel times are needed for spoofing detection). Fills live in `execution`.
- **Position grain.** One end-of-day snapshot per strategy, security and trade date, with signed quantity
  and that day's realised P&L. Unrealised P&L is not stored: views mark positions to the day's last price.
- **Trading day** is the IST calendar date (`AT TIME ZONE 'Asia/Kolkata'`), since the data is NSE.
- **Integrity in the database, not only the app.** Over-fills, fills on closed orders, fills outside
  the limit price and fills before submission are rejected by a trigger. The app's order entry is one
  stored function, so the order, event, fill and position update commit or roll back together.
- **Least privilege.** The app connects as `trading_app` (no DDL) for writes and `trading_readonly`
  for analytics. Neither can drop tables, and the read-only role cannot read password hashes.
- **Why MongoDB for surveillance.** Each alert type carries different evidence (an order, a burst of
  cancels, an hourly volume bucket). A document per alert stores the query row as-is, and the review
  workflow, case notes and audit log are append-heavy and schema-light. Alerts are upserted on a
  stable key, so re-running the job never duplicates alerts or resets one under review.

## Queries

| # | Query | SQL features |
|---|---|---|
| Q01 | Bid-ask spread by security | aggregates |
| Q02 | Daily VWAP vs close | join to a view, weighted average |
| Q03 | Fill summary by status and type | CTE, LEFT JOIN |
| Q04 | Fill ratio per strategy | CTE, LEFT JOIN |
| Q05 | Volume per strategy and year | `GROUP BY ROLLUP`, `GROUPING()`, `LATERAL` |
| Q06 | Order flow and buy/sell imbalance | `FILTER`, multiple CTEs |
| Q07 | Top securities per quarter | `RANK()` and `SUM() OVER` windows |
| Q08 | Realised P&L per strategy | `FILTER`, aggregates |
| Q09 | Latest quote at a time | `LATERAL ... LIMIT 1`, index-backed (EXPLAIN demo) |
| Q10 | Abnormally wide spreads | config-driven threshold |
| Q11 | Slippage vs arrival mid | `LATERAL` as-of join |
| Q12 | Order-to-trade ratio, cancel rate | correlated `LATERAL` count |
| Q13 | Cumulative P&L | running `SUM() OVER` |
| Q14 | Maximum drawdown | running `MAX() OVER`, `array_agg ORDER BY` |
| Q15 | Unusually large orders | surveillance |
| Q16 | Possible spoofing | surveillance, intervals, `HAVING` |
| Q17 | Volume spikes | surveillance, `date_trunc` buckets |
| Q18 | Excessive turnover | surveillance / risk |
| Q19 | Strategy performance | `StrategyPerformance` view |
| Q20 | Composite screen (two or more flags) | `lag()`, five CTEs, flag scoring |

## Tests

```bash
node tests/run_tests.mjs            # 30 cases: constraints, triggers, procedures, roles, API access control
python3 tests/validate_pandas.py    # Q01, Q02, Q04, Q13 recomputed in pandas
sh scripts/psql.sh -f sql/demo/advanced_features_demo.sql
```

Results: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) and [docs/PANDAS_CROSSCHECK.md](docs/PANDAS_CROSSCHECK.md).
Data provenance: [data/PROVENANCE.md](data/PROVENANCE.md).
