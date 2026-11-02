# Quant Trading Database Project: handoff

## Status (2026-10-31)
All phases in workflow.txt are implemented and verified on this Mac:
- Schema, indexes, roles, config, views, triggers and stored functions (`sql/01`-`06`).
- Data: download -> generate -> one-transaction COPY load -> user seeding -> sanity checks (0 violations).
- Q01-Q20 in `sql/queries/`, all run in the app (Queries page) and from psql.
- MongoDB: alerts, audit_log and case_notes with validators and indexes; surveillance job; `$facet` dashboard.
- Next.js app with Trader and Compliance roles, 20 Route Handlers, 9 pages.
- Tests: 30/30 in `docs/TEST_RESULTS.md`; pandas cross-check of Q01, Q02, Q04 and Q13 passes.
- Presentation script: `docs/DEMO.md`.

Open items for the team:
- **Check Q01-Q20 against the assignment's own list.** The original Q1-Q20 wording was not in the
  repo, so the queries were written from the index comments and the workflow notes (spread, VWAP,
  slippage, Q9 latest quote, Q15-Q17 surveillance, Q19 StrategyPerformance, Q20 composite). Rename or
  adjust any that differ.
- Fill in the contributions table in `docs/DEMO.md`.
- Screenshots for the report: one per page, plus Q-results from the Queries page.

## Running it
See README.md. On this Mac (no Docker): `npm run db:up` then `npm run dev`.
With Docker: `docker compose --env-file .env.local up -d`, then the ingestion commands below.

## Commands (run from the repo root; each also works from any directory)
| Step | Command | Output |
|---|---|---|
| Download real prices | `python3 ingestion/download_prices.py` | data/raw/daily_prices.csv |
| Generate dataset (seed 42) | `python3 ingestion/generate_data.py` | data/generated/*.csv, data/PROVENANCE.md |
| Load into Postgres | `sh ingestion/load_data.sh` | truncates and reloads all tables (triggers off during COPY), seeds users, runs the checks |
| Re-seed demo users only | `sh ingestion/seed_users.sh` | trader1-trader5 (one per strategy) and compliance |
| Sanity checks only | `sh scripts/psql.sh -f ingestion/sanity_checks.sql` | every "violations" value should be 0 |
| Advanced features demo | `sh scripts/psql.sh -f sql/demo/advanced_features_demo.sql` | rolls back at the end |
| ALTER/DROP demo | `sh scripts/psql.sh -f sql/migrations/001_alter_drop_demo.sql` | leaves the schema unchanged |
| Tests | `node tests/run_tests.mjs` and `python3 tests/validate_pandas.py` | docs/TEST_RESULTS.md, docs/PANDAS_CROSSCHECK.md |

Notes:
- `scripts/psql.sh` targets the local database from `scripts/local.sh`. With Docker use
  `docker exec -i trading_postgres psql -U trading_admin -d trading_db < file.sql`.
- load_data.sh and seed_users.sh use the postgres container by default; `PSQL_URL=...` points them at
  any other Postgres (scripts/local.sh does this).
- Demo passwords are SEED_TRADER_PASSWORD / SEED_ADMIN_PASSWORD in .env.local (bcrypt hashes via pgcrypto).
- The generator plants 10 large orders and 6 spoofing bursts after the normal data (same seed, base
  data unchanged), so the surveillance queries have known cases to find.
- The thresholds in sql/04_config.sql were tuned so each check flags the planted cases plus a few
  borderline real ones. Changing them in the app is audited.
