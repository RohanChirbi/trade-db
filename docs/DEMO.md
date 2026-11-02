# Presentation script

In the rubric's order. About 15 minutes. Before you start:

```bash
npm run db:up && npm run dev        # databases + app on http://localhost:3000
```

Have two browser windows ready: one logged in as `compliance`, one (private window) as `trader1`.
Passwords are `SEED_ADMIN_PASSWORD` and `SEED_TRADER_PASSWORD` in `.env.local`.
Keep a terminal open in the project folder for steps 4, 7 and 8.

## 1. ER diagram (1 min): app → Schema

- 10 PostgreSQL tables. Market data (`security`, `market_quote`), the order lifecycle (`orders`,
  `order_event`, `execution`), derived state (`position`, `risk_metric`), and `strategy`, `app_user`,
  `surveillance_config`.
- Point out three spec gaps we resolved: `order_event` for cancel times, the position grain (one row
  per strategy, security and day, signed quantity), and `surveillance_config` for tunable thresholds.

## 2. Schema (1 min): same page, scroll down

- The data dictionary is read live from the PostgreSQL catalog, so it always matches the database.
- Show CHECK constraints (`ck_limit_price_rule`, `ck_quote_bid_le_ask`, `ck_trader_has_strategy`), the
  FK actions (`order_event` CASCADE vs `execution` RESTRICT), and the three MongoDB collections with
  their indexes.
- ALTER/DROP: `sh scripts/psql.sh -f sql/migrations/001_alter_drop_demo.sql`

## 3. Implementation and data (1.5 min)

- Real prices from Yahoo Finance; intraday quotes and orders generated with a fixed seed (42).
- Loaded with `COPY` in **one transaction** (`ingestion/load_data.sh`), then sanity checks: every
  violation count is 0.
- Three database roles: the app never connects as admin.

## 4. Queries (3 min): app → Queries Q1–Q20 (compliance)

Each query is the `.sql` file from the repo, run unchanged on the read-only role. Suggested picks:

- **Q05**: `ROLLUP` subtotals and grand total.
- **Q07**: `RANK()` window per quarter.
- **Q09**: then click **EXPLAIN ANALYZE**: Index Scan Backward on `idx_quote_ticker_ts`.
- **Q14**: drawdown with running `MAX() OVER`.
- **Q16**: finds exactly the 6 planted spoofing bursts.
- **Q20**: composite screen scoring four flags.

## 5. UI (3 min)

As **trader1**:
- Overview: P&L for their strategy only.
- Orders: submit a MARKET order and read the message (filled, position updated, one transaction).
  Submit a LIMIT BUY well below the bid: it stays OPEN. Cancel it, click the row: SUBMITTED and
  CANCELLED events.
- Try a quantity of 1,000,000: rejected by the pre-trade risk check, with the database's message.
- Positions & P&L, then Analytics (spread, VWAP vs close, slippage).
- Note the nav has no Surveillance or Queries links. The API returns 403 for them too.

## 6. Integration, PostgreSQL → MongoDB (2 min): compliance → Surveillance

- Click **Run surveillance job**: Q10, Q15-Q18 and Q20 run in Postgres and are upserted into
  `alerts`. Run it again: 0 new, no duplicates.
- The charts come from one `$facet` aggregation (by type, security, strategy, month).
- **Alert review**: open a SPOOFING alert, show the evidence row, click *Start review*, add a case
  note, *Escalate*.
- Back on Surveillance: lower `volume_spike_multiple` from 12 to 6, save, re-run: VOLUME SPIKE goes from 10 to 58 alerts (lowering `turnover_pct` from 10 to 5 also works, giving 79). Put it back afterwards. Then show more
  alerts. The audit log shows LOGIN, PLACE_ORDER, CANCEL_ORDER, ALERT_STATUS, CASE_NOTE and CONFIG_CHANGE.

## 7. Advanced features (2 min): terminal

```bash
sh scripts/psql.sh -f sql/demo/advanced_features_demo.sql
```

Walk through the output: trigger-created position row, over-fill / limit / cancelled-order rejections,
atomic rollback (order count unchanged), UPDATE correction, DELETE CASCADE vs RESTRICT, the
`StrategyPerformance` view, and Q9 at about 19 ms without the index vs about 0.2 ms with it. Everything is
rolled back at the end.

## 8. Tests (1 min)

```bash
node tests/run_tests.mjs            # 30/30 with the app running
python3 tests/validate_pandas.py    # Q01, Q02, Q04, Q13 match pandas
```

Show `docs/TEST_RESULTS.md`, the input / expected / actual table.

## 9. Contributions

| Member | Contributions |
|---|---|
| | |
| | |
| | |

## If something goes wrong

- "Database unavailable" in the app: `npm run db:up`.
- Data was changed during rehearsal: `npm run db:reset` (about 30 s) gives a clean dataset with no alerts.
- Port 3000 busy: `npm run dev -- -p 3001`.
