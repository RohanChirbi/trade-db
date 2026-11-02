-- migrations/001_alter_drop_demo.sql : demonstrates ALTER and DROP
-- NOT run at startup (sub-folders of ./sql are ignored). Run by hand as the admin user:
--   docker exec -i trading_postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB> < sql/migrations/001_alter_drop_demo.sql
-- Everything runs in one transaction and ends with the schema unchanged.

BEGIN;

-- 1. ALTER TABLE ... ADD COLUMN
ALTER TABLE security ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'security' AND column_name = 'is_active';

-- 2. ALTER TABLE ... ADD CONSTRAINT
ALTER TABLE strategy ADD CONSTRAINT ck_demo_min_capital CHECK (assigned_capital >= 100000);
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conname = 'ck_demo_min_capital';

-- 3. ALTER TABLE ... ALTER COLUMN
ALTER TABLE security ALTER COLUMN company_name TYPE VARCHAR(150);
SELECT character_maximum_length FROM information_schema.columns
WHERE table_name = 'security' AND column_name = 'company_name';

-- 4. CREATE then DROP a scratch table and index
CREATE TABLE demo_scratch (id INTEGER PRIMARY KEY, note TEXT);
CREATE INDEX idx_demo_scratch_note ON demo_scratch (note);
DROP INDEX idx_demo_scratch_note;
DROP TABLE demo_scratch;

-- 5. DROP the constraint and column again, and restore the column type
ALTER TABLE strategy DROP CONSTRAINT ck_demo_min_capital;
ALTER TABLE security DROP COLUMN is_active;
ALTER TABLE security ALTER COLUMN company_name TYPE VARCHAR(100);

-- 6. Confirm the demo leaves nothing behind (expect 0 rows)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'security' AND column_name = 'is_active';

COMMIT;

-- Optional index demo for the performance section (run after the data is loaded):
--   DROP INDEX idx_quote_ticker_ts;
--   EXPLAIN ANALYZE <your Q9 query>;
--   CREATE UNIQUE INDEX idx_quote_ticker_ts ON market_quote (ticker, quote_ts);
--   EXPLAIN ANALYZE <your Q9 query>;