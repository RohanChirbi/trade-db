// MongoDB: surveillance alerts, the audit log and case notes.
// Collections are created with JSON-schema validators and indexes on first use (idempotent).
import { MongoClient, type Db } from "mongodb";

const g = globalThis as unknown as { mongo?: MongoClient; mongoReady?: Promise<Db> };

export const ALERT_STATUSES = ["OPEN", "UNDER_REVIEW", "ESCALATED", "DISMISSED"] as const;
export const ALERT_TYPES = ["LARGE_ORDER", "SPOOFING", "VOLUME_SPIKE", "TURNOVER", "WIDE_SPREAD", "MULTI_FLAG"] as const;

async function setup(db: Db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const create = async (name: string, validator: object) => {
    if (!existing.has(name)) await db.createCollection(name, { validator: { $jsonSchema: validator } });
  };

  await create("alerts", {
    bsonType: "object",
    required: ["key", "type", "severity", "status", "title", "created_at"],
    properties: {
      key: { bsonType: "string", description: "type:entity:date, unique so re-running the job never duplicates" },
      type: { enum: [...ALERT_TYPES] },
      severity: { enum: ["LOW", "MEDIUM", "HIGH"] },
      status: { enum: [...ALERT_STATUSES] },
      title: { bsonType: "string" },
      ticker: { bsonType: ["string", "null"] },
      strategy_id: { bsonType: ["int", "null"] },
      trade_date: { bsonType: ["string", "null"] },
      details: { bsonType: "object" },
      created_at: { bsonType: "date" },
    },
  });
  await create("audit_log", {
    bsonType: "object",
    required: ["ts", "action", "username"],
    properties: {
      ts: { bsonType: "date" },
      action: { bsonType: "string" },
      username: { bsonType: "string" },
      role: { bsonType: ["string", "null"] },
      details: { bsonType: "object" },
    },
  });
  await create("case_notes", {
    bsonType: "object",
    required: ["alert_id", "author", "note", "created_at"],
    properties: {
      alert_id: { bsonType: "objectId" },
      author: { bsonType: "string" },
      note: { bsonType: "string", minLength: 1 },
      created_at: { bsonType: "date" },
    },
  });

  await db.collection("alerts").createIndexes([
    { key: { key: 1 }, name: "uq_alert_key", unique: true },
    { key: { status: 1, severity: 1, created_at: -1 }, name: "review_queue" },
    { key: { type: 1, trade_date: -1 }, name: "by_type_date" },
    { key: { ticker: 1 }, name: "by_ticker" },
    { key: { strategy_id: 1 }, name: "by_strategy" },
  ]);
  await db.collection("audit_log").createIndexes([
    { key: { ts: -1 }, name: "recent" },
    { key: { username: 1, ts: -1 }, name: "by_user" },
    { key: { action: 1, ts: -1 }, name: "by_action" },
  ]);
  await db.collection("case_notes").createIndex({ alert_id: 1, created_at: 1 }, { name: "by_alert" });
  return db;
}

export function mongo(): Promise<Db> {
  if (!g.mongoReady) {
    g.mongo ??= new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017", {
      serverSelectionTimeoutMS: 3000,
    });
    g.mongoReady = g.mongo
      .connect()
      .then((c) => setup(c.db(process.env.MONGODB_DB ?? "trading_surveillance")))
      .catch((e) => {
        g.mongoReady = undefined; // retry on the next request
        throw e;
      });
  }
  return g.mongoReady;
}
