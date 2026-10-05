import { neon } from "@neondatabase/serverless";
import { env } from "../config/env.js";
const sql = neon(env.databaseUrl);
const q = async (t: string) => (await sql.query(t)) as unknown as Record<string, unknown>[];

const r = await q(`select count(*) filter (where search_embedding is not null)::int as with_emb, count(*) filter (where search_embedding is null)::int as null_emb, count(*)::int as total from animals`);
console.log("AFTER BACKFILL:", JSON.stringify(r[0]));

// Every stored vector must be exactly 768 dims - a wrong-length vector would
// silently corrupt ranking, so verify in the database, not in the app.
const dims = await q(`select vector_dims(search_embedding) as dims, count(*)::int as n from animals where search_embedding is not null group by 1`);
console.log("vector dimensions stored:", JSON.stringify(dims));

// Prove no duplicate animals and no unintended field changes.
const dupes = await q(`select count(*)::int as dup_public_ids from (select public_id from animals group by 1 having count(*) > 1) x`);
console.log("duplicate public_ids:", dupes[0].dup_public_ids);
const dupNames = await q(`select count(*)::int as dup_names from (select lower(name) from animals group by 1 having count(*) > 1) x`);
console.log("duplicate names:", dupNames[0].dup_names);

const rows = await q(`select public_id, name, type, status, medically_cleared, deleted_at, updated_at from animals order by public_id`);
console.log("rows after backfill (total " + rows.length + "):");
for (const a of rows) console.log(`  ${a.public_id} | ${a.name} | status=${a.status} | cleared=${a.medically_cleared} | deleted=${a.deleted_at ?? "no"} | updated=${String(a.updated_at).slice(0,19)}`);