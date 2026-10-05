import { neon } from "@neondatabase/serverless";
import { env } from "../config/env.js";

const sql = neon(env.databaseUrl);
const raw = await sql.query(`select 1 as one`);
console.log("typeof raw:", typeof raw);
console.log("keys:", raw && typeof raw === "object" ? Object.keys(raw) : raw);
console.log(JSON.stringify(raw));