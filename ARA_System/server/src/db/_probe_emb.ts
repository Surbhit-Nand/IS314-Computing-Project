import { neon } from "@neondatabase/serverless";
import { env } from "../config/env.js";
const sql = neon(env.databaseUrl);
const q = async (t: string) => (await sql.query(t)) as unknown as Record<string, unknown>[];
const r = await q(`select count(*) filter (where search_embedding is not null)::int as with_emb, count(*) filter (where search_embedding is null)::int as null_emb, count(*)::int as total from animals`);
console.log("BEFORE BACKFILL:", JSON.stringify(r[0]));