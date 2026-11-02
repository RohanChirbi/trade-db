// tests/run_tests.mjs : database and API test cases -> docs/TEST_RESULTS.md
// Every database case runs inside a transaction that is rolled back, so the data is never changed.
// Usage: node tests/run_tests.mjs            (API cases run too when the app answers on APP_URL)
//        APP_URL=http://localhost:3001 node tests/run_tests.mjs
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const app = new pg.Client({ connectionString: env.DATABASE_URL });
const ro = new pg.Client({ connectionString: env.DATABASE_URL_READONLY });
await app.connect();
await ro.connect();

const results = [];
async function tx(client, fn) {
  await client.query("BEGIN");
  try { return await fn(); } finally { await client.query("ROLLBACK"); }
}
/** A case passes when `run` returns the expected value or throws an error containing `expect`. */
async function test(area, name, input, expect, run) {
  let actual;
  try {
    actual = await run();
  } catch (e) {
    actual = `ERROR: ${e.message}`;
  }
  const pass = typeof expect === "function" ? expect(actual) : String(actual).includes(expect);
  results.push({ area, name, input, expected: typeof expect === "function" ? expect.describe : expect, actual: String(actual), pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${area}: ${name}`);
}
const q1 = async (c, sql, args) => (await c.query(sql, args)).rows[0];
const order = (c, sql = "SELECT place_order(1, 'TCS.NS', 'BUY', 'LIMIT', 100, 3000) AS id") => q1(c, sql).then((r) => r.id);

// ---------------------------------------------------------------- constraints
await test("Constraint", "Negative order quantity rejected", "INSERT orders quantity = -5", "orders_quantity_check", () =>
  tx(app, () => app.query("INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, submitted_ts) VALUES (1,'TCS.NS','BUY','MARKET',-5,now())")));
await test("Constraint", "LIMIT order without a price rejected", "INSERT orders LIMIT, limit_price NULL", "ck_limit_price_rule", () =>
  tx(app, () => app.query("INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, submitted_ts) VALUES (1,'TCS.NS','BUY','LIMIT',10,now())")));
await test("Constraint", "MARKET order with a price rejected", "INSERT orders MARKET, limit_price 100", "ck_limit_price_rule", () =>
  tx(app, () => app.query("INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, limit_price, submitted_ts) VALUES (1,'TCS.NS','BUY','MARKET',10,100,now())")));
await test("Constraint", "Invalid side rejected", "INSERT orders side = 'HOLD'", "orders_side_check", () =>
  tx(app, () => app.query("INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, submitted_ts) VALUES (1,'TCS.NS','HOLD','MARKET',10,now())")));
await test("Constraint", "Crossed quote (bid > ask) rejected", "INSERT market_quote bid 101, ask 100", "ck_quote_bid_le_ask", () =>
  tx(app, () => app.query("INSERT INTO market_quote (ticker, quote_ts, bid_price, bid_qty, ask_price, ask_qty, last_price) VALUES ('TCS.NS', now(), 101, 1, 100, 1, 100)")));
await test("Constraint", "Duplicate quote for the same ticker and time rejected", "INSERT an existing (ticker, quote_ts)", "idx_quote_ticker_ts", () =>
  tx(app, () => app.query("INSERT INTO market_quote (ticker, quote_ts, bid_price, bid_qty, ask_price, ask_qty, last_price) SELECT ticker, quote_ts, 1, 1, 2, 1, 1 FROM market_quote LIMIT 1")));
await test("Constraint", "Order for an unknown security rejected (FK)", "INSERT orders ticker = 'FAKE.NS'", "orders_ticker_fkey", () =>
  tx(app, () => app.query("INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, submitted_ts) VALUES (1,'FAKE.NS','BUY','MARKET',10,now())")));
await test("Constraint", "Trader without a strategy rejected", "INSERT app_user role TRADER, strategy_id NULL", "ck_trader_has_strategy", () =>
  tx(app, () => app.query("INSERT INTO app_user (username, password_hash, role) VALUES ('x', 'x', 'TRADER')")));
await test("Constraint", "Second SUBMITTED event for one order rejected", "INSERT order_event SUBMITTED twice", "uq_order_event", () =>
  tx(app, async () => {
    const id = await order(app);
    await app.query("INSERT INTO order_event (order_id, event_type, event_ts) VALUES ($1, 'SUBMITTED', now())", [id]);
  }));
await test("Constraint", "Order with fills cannot be deleted (FK RESTRICT)", "DELETE an order that has executions", "execution_order_id_fkey", () =>
  tx(app, () => app.query("DELETE FROM orders WHERE order_id = (SELECT order_id FROM execution LIMIT 1)")));

// ---------------------------------------------------------------- triggers and procedures
await test("Trigger", "Partial then full fill updates the order status", "LIMIT BUY 100; fill 40, then 60", "PARTIAL -> FILLED", () =>
  tx(app, async () => {
    const id = await order(app);
    await app.query("SELECT record_execution($1, 40, 3000)", [id]);
    const a = (await q1(app, "SELECT status FROM orders WHERE order_id = $1", [id])).status;
    await app.query("SELECT record_execution($1, 60, 2999)", [id]);
    const b = (await q1(app, "SELECT status FROM orders WHERE order_id = $1", [id])).status;
    return `${a} -> ${b}`;
  }));
await test("Trigger", "Over-fill rejected", "LIMIT BUY 100; fill 80, then 30", "over-fill rejected", () =>
  tx(app, async () => {
    const id = await order(app);
    await app.query("SELECT record_execution($1, 80, 3000)", [id]);
    await app.query("SELECT record_execution($1, 30, 3000)", [id]);
  }));
await test("Trigger", "Fill on a cancelled order rejected", "cancel_order(), then a fill", "is CANCELLED, it cannot receive fills", () =>
  tx(app, async () => {
    const id = await order(app);
    await app.query("SELECT cancel_order($1)", [id]);
    await app.query("SELECT record_execution($1, 10, 3000)", [id]);
  }));
await test("Trigger", "Fill before the order was submitted rejected", "fill timestamp 1 hour before submission", "is before order", () =>
  tx(app, async () => {
    const id = await order(app);
    await app.query("SELECT record_execution($1, 10, 3000, now() - interval '1 hour')", [id]);
  }));
await test("Trigger", "Fill above a BUY limit price rejected", "LIMIT BUY at 3000, fill at 3001", "violates the limit price", () =>
  tx(app, async () => {
    const id = await order(app);
    await app.query("SELECT record_execution($1, 10, 3001)", [id]);
  }));
await test("Trigger", "Position and realised P&L updated from fills", "new strategy position: BUY 100 @100, SELL 40 @110", "qty=60 avg=100.0000 realised=400.0000", () =>
  tx(app, async () => {
    // use a ticker strategy 5 has never traded so the position starts flat
    const t = (await q1(app, "SELECT ticker FROM security WHERE ticker NOT IN (SELECT ticker FROM position WHERE strategy_id = 5) LIMIT 1"))?.ticker;
    if (!t) return "skipped: strategy 5 already holds every security";
    const b = (await q1(app, "SELECT place_order(5, $1, 'BUY', 'LIMIT', 100, 100) AS id", [t])).id;
    await app.query("SELECT record_execution($1, 100, 100)", [b]);
    const s = (await q1(app, "SELECT place_order(5, $1, 'SELL', 'LIMIT', 40, 110) AS id", [t])).id;
    await app.query("SELECT record_execution($1, 40, 110)", [s]);
    const p = await q1(app, "SELECT quantity, avg_entry_price, realised_pnl FROM position WHERE strategy_id = 5 AND ticker = $1 ORDER BY trade_date DESC LIMIT 1", [t]);
    return `qty=${p.quantity} avg=${p.avg_entry_price} realised=${p.realised_pnl}`;
  }));
await test("Procedure", "submit_order() fills a MARKET order atomically", "submit_order(1, TCS.NS, BUY, MARKET, 10)", "FILLED 10", () =>
  tx(app, async () => {
    const r = await q1(app, "SELECT * FROM submit_order(1, 'TCS.NS', 'BUY', 'MARKET', 10)");
    return `${r.status} ${r.filled_qty}`;
  }));
await test("Transaction", "Failed risk check leaves no order behind", "submit_order quantity 1,000,000 (over 10% of capital)", "orders unchanged: true", () =>
  tx(app, async () => {
    const before = (await q1(app, "SELECT count(*)::int AS n FROM orders")).n;
    await app.query("SAVEPOINT s");
    try { await app.query("SELECT * FROM submit_order(1, 'TCS.NS', 'BUY', 'MARKET', 1000000)"); } catch { await app.query("ROLLBACK TO SAVEPOINT s"); }
    const after = (await q1(app, "SELECT count(*)::int AS n FROM orders")).n;
    return `orders unchanged: ${before === after}`;
  }));
await test("Procedure", "Cancelling a filled order rejected", "cancel_order() on a FILLED order", "cannot be cancelled", () =>
  tx(app, () => app.query("SELECT cancel_order((SELECT order_id FROM orders WHERE status = 'FILLED' LIMIT 1))")));
await test("Procedure", "LIMIT order with NaN price rejected", "submit_order(..., 'LIMIT', 10, 'NaN')", "needs a positive limit price", () =>
  tx(app, () => app.query("SELECT * FROM submit_order(1, 'TCS.NS', 'BUY', 'LIMIT', 10, 'NaN')")));

// ---------------------------------------------------------------- database roles
await test("Role", "Read-only role cannot read password hashes", "trading_readonly: SELECT FROM app_user", "permission denied", () =>
  ro.query("SELECT password_hash FROM app_user LIMIT 1"));
await test("Role", "Read-only role cannot write", "trading_readonly: INSERT INTO orders", "permission denied", () =>
  tx(ro, () => ro.query("INSERT INTO orders (strategy_id, ticker, side, order_type, quantity, submitted_ts) VALUES (1,'TCS.NS','BUY','MARKET',10,now())")));
await test("Role", "App role cannot change the schema", "trading_app: DROP TABLE orders", "must be owner", () =>
  tx(app, () => app.query("DROP TABLE orders")));

// ---------------------------------------------------------------- API (only when the app is running)
let appUp = false;
try { appUp = (await fetch(`${APP_URL}/api/me`)).status === 401; } catch { /* not running */ }
if (appUp) {
  const login = async (username, password) => {
    const r = await fetch(`${APP_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] };
  };
  const get = (path, cookie) => fetch(`${APP_URL}${path}`, { headers: cookie ? { cookie } : {} });
  const trader = await login("trader1", env.SEED_TRADER_PASSWORD);
  const comp = await login("compliance", env.SEED_ADMIN_PASSWORD);
  await test("API", "Wrong password rejected", "POST /api/auth/login trader1 / wrong", "401", async () => (await login("trader1", "wrong")).status);
  await test("API", "Unauthenticated request rejected", "GET /api/orders without a session", "401", async () => (await get("/api/orders")).status);
  await test("API", "Trader blocked from surveillance", "GET /api/alerts as trader1", "403", async () => (await get("/api/alerts", trader.cookie)).status);
  await test("API", "Trader blocked from the query runner", "GET /api/queries/q16 as trader1", "403", async () => (await get("/api/queries/q16", trader.cookie)).status);
  await test("API", "Trader only sees own strategy", "GET /api/orders?strategy=3 as trader1", "strategies: 1", async () => {
    const r = await (await get("/api/orders?strategy=3", trader.cookie)).json();
    return `strategies: ${[...new Set(r.rows.map((o) => o.strategy_id))].join(",")}`;
  });
  await test("API", "Compliance cannot place orders", "POST /api/orders as compliance", "403", async () =>
    (await fetch(`${APP_URL}/api/orders`, { method: "POST", headers: { cookie: comp.cookie, "Content-Type": "application/json" }, body: "{}" })).status);
  await test("API", "Compliance sees every strategy", "GET /api/orders as compliance", "strategies: 5", async () => {
    const ids = new Set();
    for (let s = 1; s <= 5; s++) {
      const r = await (await get(`/api/orders?strategy=${s}`, comp.cookie)).json();
      r.rows.forEach((o) => ids.add(o.strategy_id));
    }
    return `strategies: ${ids.size}`;
  });
} else {
  console.log(`(API cases skipped: app not reachable at ${APP_URL})`);
}

await app.end();
await ro.end();

// ---------------------------------------------------------------- report
const esc = (s) => String(s).replaceAll("|", "\\|").replaceAll("\n", " ").slice(0, 160);
const passed = results.filter((r) => r.pass).length;
const md = [
  "# Test results",
  "",
  `Generated by \`node tests/run_tests.mjs\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC: **${passed} of ${results.length} passed**.`,
  "Database cases run inside a rolled-back transaction as the app or read-only role, exactly as the application connects.",
  "",
  "| # | Area | Test | Input | Expected | Actual | Result |",
  "|---|---|---|---|---|---|---|",
  ...results.map((r, i) => `| ${i + 1} | ${r.area} | ${esc(r.name)} | ${esc(r.input)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.pass ? "PASS" : "**FAIL**"} |`),
  "",
].join("\n");
writeFileSync(new URL("../docs/TEST_RESULTS.md", import.meta.url), md);
console.log(`\n${passed}/${results.length} passed -> docs/TEST_RESULTS.md`);
process.exit(passed === results.length ? 0 : 1);
