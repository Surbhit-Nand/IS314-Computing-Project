import { neon } from "@neondatabase/serverless";
import { env } from "../config/env.js";
const sql = neon(env.databaseUrl);
const q = async (t: string) => (await sql.query(t)) as unknown as Record<string, unknown>[];
const rows = await q(`select id, created_at, hash from drizzle.__drizzle_migrations order by id desc limit 4`);
console.log("last applied migrations (newest first):");
for (const r of rows) console.log("  id", r.id, "|", String(r.created_at).slice(0,19), "|", String(r.hash).slice(0,12));
// Prove data integrity: every pre-existing animal row still present & unchanged shape
const animals = await q(`select id, public_id, name, type, status, medically_cleared, deleted_at, search_embedding is null as emb_null from animals order by created_at`);
console.log(`all ${animals.length} animal rows after migration:`);
for (const a of animals) console.log(`  ${a.public_id} | ${a.name} | ${a.type} | status=${a.status} | cleared=${a.medically_cleared} | deleted=${a.deleted_at ?? "no"} | emb_null=${a.emb_null}`);