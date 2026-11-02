-- 06_procedures.sql : advanced features - triggers, stored functions and transactional order entry
SET client_min_messages = warning;   -- hide "trigger does not exist, skipping" notices on first run
--
--   trg_execution_validate  BEFORE INSERT on execution : rejects over-fills, fills on closed orders,
--                           fills before submission and fills outside the limit price
--   trg_execution_apply     AFTER INSERT on execution  : sets the order status and updates the position
--   place_order()           inserts an order and its SUBMITTED event
--   record_execution()      inserts a fill (the triggers do the rest)
--   cancel_order()          UPDATE flow: cancels a working order and logs the CANCELLED event
--   submit_order()          one atomic transaction: pre-trade risk check, order, fill at the latest
--                           quote if marketable, position update. Any error rolls all of it back.
--   correct_execution()     correction flow for a mis-booked fill price (UPDATE, audited in the app)
--
-- The bulk loader disables these triggers while it COPYs historical data (ingestion/load_data.sh).

-- ---------------------------------------------------------------- triggers
CREATE OR REPLACE FUNCTION trg_execution_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    o       orders%ROWTYPE;
    filled  integer;
BEGIN
    -- lock the parent order so concurrent fills cannot both pass the over-fill check
    SELECT * INTO o FROM orders WHERE order_id = NEW.order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order % does not exist', NEW.order_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF o.status IN ('FILLED', 'CANCELLED') THEN
        RAISE EXCEPTION 'order % is %, it cannot receive fills', o.order_id, o.status
              USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.exec_ts < o.submitted_ts THEN
        RAISE EXCEPTION 'fill time % is before order % was submitted (%)', NEW.exec_ts, o.order_id, o.submitted_ts
              USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(sum(exec_qty), 0) INTO filled FROM execution WHERE order_id = NEW.order_id;
    IF filled + NEW.exec_qty > o.quantity THEN
        RAISE EXCEPTION 'over-fill rejected: order % has % of % filled, cannot add %',
              o.order_id, filled, o.quantity, NEW.exec_qty USING ERRCODE = 'check_violation';
    END IF;

    IF o.order_type = 'LIMIT' AND (   (o.side = 'BUY'  AND NEW.exec_price > o.limit_price)
                                   OR (o.side = 'SELL' AND NEW.exec_price < o.limit_price)) THEN
        RAISE EXCEPTION 'fill price % violates the limit price % of order %', NEW.exec_price, o.limit_price, o.order_id
              USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION trg_execution_apply() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    o        orders%ROWTYPE;
    filled   integer;
    d        date := (NEW.exec_ts AT TIME ZONE 'Asia/Kolkata')::date;
    sq       integer;          -- signed fill quantity
    q        integer := 0;     -- position before this fill
    a        numeric := 0;     -- average entry price before this fill
    r        numeric := 0;     -- realised P&L already booked on day d
    new_q    integer;
    new_a    numeric;
BEGIN
    SELECT * INTO o FROM orders WHERE order_id = NEW.order_id;

    -- 1. order status
    SELECT sum(exec_qty) INTO filled FROM execution WHERE order_id = NEW.order_id;
    UPDATE orders SET status = CASE WHEN filled >= quantity THEN 'FILLED' ELSE 'PARTIAL' END
    WHERE order_id = NEW.order_id;

    -- 2. position: carry forward the latest snapshot on or before the trade date
    sq := CASE o.side WHEN 'BUY' THEN NEW.exec_qty ELSE -NEW.exec_qty END;
    SELECT p.quantity, coalesce(p.avg_entry_price, 0),
           CASE WHEN p.trade_date = d THEN p.realised_pnl ELSE 0 END
      INTO q, a, r
      FROM position p
     WHERE p.strategy_id = o.strategy_id AND p.ticker = o.ticker AND p.trade_date <= d
     ORDER BY p.trade_date DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN q := 0; a := 0; r := 0; END IF;

    IF q = 0 OR (q > 0) = (sq > 0) THEN                -- opening or adding
        new_q := q + sq;
        new_a := (abs(q) * a + abs(sq) * NEW.exec_price) / (abs(q) + abs(sq));
    ELSE                                               -- reducing, closing or flipping
        r := r + least(abs(sq), abs(q)) * (NEW.exec_price - a) * CASE WHEN q > 0 THEN 1 ELSE -1 END;
        new_q := q + sq;
        new_a := CASE WHEN new_q = 0 THEN NULL
                      WHEN (new_q > 0) <> (q > 0) THEN NEW.exec_price
                      ELSE a END;
    END IF;

    INSERT INTO position (strategy_id, ticker, trade_date, quantity, avg_entry_price, realised_pnl)
    VALUES (o.strategy_id, o.ticker, d, new_q, round(new_a, 4), round(r, 4))
    ON CONFLICT (strategy_id, ticker, trade_date) DO UPDATE
       SET quantity        = EXCLUDED.quantity,
           avg_entry_price = EXCLUDED.avg_entry_price,
           realised_pnl    = EXCLUDED.realised_pnl;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS execution_validate ON execution;
CREATE TRIGGER execution_validate BEFORE INSERT ON execution
    FOR EACH ROW EXECUTE FUNCTION trg_execution_validate();

DROP TRIGGER IF EXISTS execution_apply ON execution;
CREATE TRIGGER execution_apply AFTER INSERT ON execution
    FOR EACH ROW EXECUTE FUNCTION trg_execution_apply();

-- ---------------------------------------------------------------- stored functions
CREATE OR REPLACE FUNCTION place_order(
    p_strategy_id integer, p_ticker varchar, p_side varchar, p_order_type varchar,
    p_quantity integer, p_limit_price numeric DEFAULT NULL, p_ts timestamptz DEFAULT now()
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
    new_id bigint;
BEGIN
    -- CHECK constraints on orders validate side, type, quantity and the limit-price rule
    INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, limit_price, submitted_ts, status)
    VALUES (p_strategy_id, upper(p_ticker), upper(p_side), upper(p_order_type), p_quantity, p_limit_price, p_ts, 'OPEN')
    RETURNING order_id INTO new_id;

    INSERT INTO order_event (order_id, event_type, event_ts) VALUES (new_id, 'SUBMITTED', p_ts);
    RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION record_execution(
    p_order_id bigint, p_qty integer, p_price numeric, p_ts timestamptz DEFAULT now()
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
    new_id bigint;
BEGIN
    INSERT INTO execution (order_id, exec_qty, exec_price, exec_ts)
    VALUES (p_order_id, p_qty, p_price, p_ts)
    RETURNING execution_id INTO new_id;
    RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION cancel_order(p_order_id bigint, p_ts timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    st varchar;
BEGIN
    UPDATE orders SET status = 'CANCELLED'
     WHERE order_id = p_order_id AND status IN ('OPEN', 'PARTIAL')
    RETURNING status INTO st;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order % cannot be cancelled (not found, filled or already cancelled)', p_order_id
              USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO order_event (order_id, event_type, event_ts) VALUES (p_order_id, 'CANCELLED', p_ts);
END $$;

-- Atomic order entry used by the app. A function body runs inside the caller's transaction,
-- so the order, its event, the fill, the status change and the position update commit together.
CREATE OR REPLACE FUNCTION submit_order(
    p_strategy_id integer, p_ticker varchar, p_side varchar, p_order_type varchar,
    p_quantity integer, p_limit_price numeric DEFAULT NULL
) RETURNS TABLE (order_id bigint, status varchar, filled_qty integer, fill_price numeric)
LANGUAGE plpgsql AS $$
DECLARE
    qt        market_quote%ROWTYPE;
    ref_px    numeric;
    capital   numeric;
    oid       bigint;
    marketable boolean;
BEGIN
    -- NaN passes "limit_price > 0" in PostgreSQL (NaN sorts above every number), so reject it here
    IF upper(p_order_type) = 'LIMIT' AND (p_limit_price IS NULL OR p_limit_price = 'NaN' OR p_limit_price <= 0) THEN
        RAISE EXCEPTION 'a LIMIT order needs a positive limit price' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO qt FROM market_quote m WHERE m.ticker = upper(p_ticker) ORDER BY m.quote_ts DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no market data for %', p_ticker USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- pre-trade risk check: a single order may use at most 10% of the strategy's capital
    SELECT assigned_capital INTO capital FROM strategy s WHERE s.strategy_id = p_strategy_id;
    ref_px := coalesce(p_limit_price, CASE WHEN upper(p_side) = 'BUY' THEN qt.ask_price ELSE qt.bid_price END);
    IF p_quantity * ref_px > 0.10 * capital THEN
        RAISE EXCEPTION 'risk check failed: order value % exceeds 10%% of strategy capital %',
              round(p_quantity * ref_px, 2), capital USING ERRCODE = 'check_violation';
    END IF;

    oid := place_order(p_strategy_id, p_ticker, p_side, p_order_type, p_quantity, p_limit_price);

    -- fill immediately at the touch when the order is marketable against the latest quote
    marketable := upper(p_order_type) = 'MARKET'
               OR (upper(p_side) = 'BUY'  AND p_limit_price >= qt.ask_price)
               OR (upper(p_side) = 'SELL' AND p_limit_price <= qt.bid_price);
    IF marketable THEN
        PERFORM record_execution(oid, p_quantity,
                                 CASE WHEN upper(p_side) = 'BUY' THEN qt.ask_price ELSE qt.bid_price END);
    END IF;

    RETURN QUERY
    SELECT o.order_id, o.status, coalesce(sum(e.exec_qty), 0)::integer, max(e.exec_price)
      FROM orders o LEFT JOIN execution e ON e.order_id = o.order_id
     WHERE o.order_id = oid
     GROUP BY o.order_id, o.status;
END $$;

-- Correction flow (UPDATE): fix the price of a mis-booked fill and return the old price so the
-- app can write it to the audit log. Position snapshots are end-of-day records and are not re-marked.
CREATE OR REPLACE FUNCTION correct_execution(p_execution_id bigint, p_new_price numeric)
RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
    old_price numeric;
BEGIN
    SELECT exec_price INTO old_price FROM execution WHERE execution_id = p_execution_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'execution % not found', p_execution_id USING ERRCODE = 'no_data_found';
    END IF;
    UPDATE execution SET exec_price = p_new_price WHERE execution_id = p_execution_id;
    RETURN old_price;
END $$;

-- ---------------------------------------------------------------- views used by the app
-- Latest position per strategy and security, marked to the latest traded price
CREATE OR REPLACE VIEW v_current_position AS
WITH latest AS (
    SELECT DISTINCT ON (strategy_id, ticker) *
      FROM position
     ORDER BY strategy_id, ticker, trade_date DESC
), px AS (
    SELECT DISTINCT ON (ticker) ticker, last_price, quote_ts
      FROM market_quote
     ORDER BY ticker, quote_ts DESC
)
SELECT l.strategy_id, l.ticker, l.trade_date AS as_of, l.quantity, l.avg_entry_price,
       px.last_price,
       l.quantity * px.last_price                                         AS market_value,
       (px.last_price - coalesce(l.avg_entry_price, px.last_price)) * l.quantity AS unrealised_pnl,
       (SELECT sum(p.realised_pnl) FROM position p
         WHERE p.strategy_id = l.strategy_id AND p.ticker = l.ticker)     AS total_realised_pnl
  FROM latest l
  JOIN px ON px.ticker = l.ticker;
