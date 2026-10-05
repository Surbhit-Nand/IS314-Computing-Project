import { neon } from "@neondatabase/serverless";
import { env } from "../config/env.js";

const sql = neon(env.databaseUrl);
const q = async (text: string) => (await sql.query(text)) as unknown as Record<string, unknown>[];

const ext = await q(`select extname, extversion from pg_extension where extname = 'vector'`);
const col = await q(`
  select c.column_name, c.data_type, c.udt_name, c.is_nullable,
         format_type(a.atttypid, a.atttypmod) as full_type
  from information_schema.columns c
  join pg_class t on t.relname = 'animals'
  join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = t.oid and a.attname = c.column_name
  where c.table_name = 'animals' and c.column_name = 'search_embedding'`);
const cnt = await q(`select count(*)::int as total from animals`);
const del = await q(`select count(*)::int as deleted from animals where deleted_at is not null`);
const tabs = await q(`select count(*)::int as tables from information_schema.tables where table_schema='public'`);

console.log("BEFORE MIGRATION");
console.log("  vector extension:", ext.length ? JSON.stringify(ext) : "(absent)");
console.log("  search_embedding column:", col.length ? JSON.stringify(col) : "(absent)");
console.log("  animal rows:", cnt[0].total, "| soft-deleted:", del[0].deleted);
console.log("  public tables:", tabs[0].tables);