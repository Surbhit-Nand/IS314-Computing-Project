import { neon } from "@neondatabase/serverless";
import { env } from "../config/env.js";
const sql = neon(env.databaseUrl);
const q = async (t: string) => (await sql.query(t)) as unknown as Record<string, unknown>[];

console.log("POST-MIGRATION VERIFICATION");
console.log("  vector enabled:", JSON.stringify(await q(`select extname, extversion from pg_extension where extname='vector'`)));
console.log("  column:", JSON.stringify(await q(`
  select c.column_name, c.udt_name, c.is_nullable,
         format_type(a.atttypid, a.atttypmod) as full_type, a.attnotnull as not_null_flag
  from information_schema.columns c
  join pg_class t on t.relname='animals'
  join pg_namespace n on n.oid=t.relnamespace and n.nspname='public'
  join pg_attribute a on a.attrelid=t.oid and a.attname=c.column_name
  where c.table_name='animals' and c.column_name='search_embedding'`)));
console.log("  default:", JSON.stringify(await q(`select column_default from information_schema.columns where table_name='animals' and column_name='search_embedding'`)));
const mig = await q(`select table_schema, table_name from information_schema.tables where table_name like '%migrations%'`);
console.log("  migration tables:", JSON.stringify(mig));
console.log("  animals:", (await q(`select count(*)::int c from animals`))[0].c, "| tables:", (await q(`select count(*)::int c from information_schema.tables where table_schema='public'`))[0].c);