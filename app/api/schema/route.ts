import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";

// ER diagram source (docs/er.mmd) plus a live data dictionary read from the PostgreSQL catalog
export const GET = handler(async () => {
  await requireSession();
  const [er, columns, constraints, objects] = await Promise.all([
    readFile(path.join(process.cwd(), "docs", "er.mmd"), "utf8"),
    db.query(`SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length, c.numeric_precision, c.numeric_scale,
                     c.is_nullable, c.column_default, c.is_identity
              FROM information_schema.columns c
              JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
              WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
              ORDER BY c.table_name, c.ordinal_position`),
    db.query(`SELECT rel.relname AS table_name, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition
              FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
              JOIN pg_namespace n ON n.oid = rel.relnamespace
              WHERE n.nspname = 'public' ORDER BY rel.relname, con.contype, con.conname`),
    db.query(`SELECT 'view' AS kind, table_name AS name FROM information_schema.views WHERE table_schema = 'public'
              UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname NOT LIKE 'pgp_%' AND p.proname NOT IN
                        ('armor','dearmor','crypt','gen_salt','gen_random_bytes','gen_random_uuid','digest','hmac','encrypt','decrypt','encrypt_iv','decrypt_iv','pgp_armor_headers','pgp_key_id','fips_mode')
              UNION ALL SELECT 'trigger', tgname || ' on ' || tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal
              UNION ALL SELECT 'index', indexname || ' on ' || tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
              ORDER BY 1, 2`),
  ]);
  return Response.json({ er, columns: columns.rows, constraints: constraints.rows, objects: objects.rows });
});
