import * as dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

// drizzle-kit's own `migrate` CLI command auto-selects the
// '@neondatabase/serverless' WEBSOCKET driver for Neon connection strings,
// which hangs indefinitely in some Node/network setups instead of erroring.
// This script runs the same migrations through drizzle-orm's neon-http
// migrator instead - the same HTTP-based (no websocket) driver the app
// already uses at runtime in server/src/db/client.ts - which does not have
// that hang.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: "server/.env" });

// Prefer the unpooled connection string for schema-changing operations, per
// Neon's guidance that pooled (pgbouncer) connections can behave
// unpredictably for DDL/migrations.
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required to run migrations");
}

const sql = neon(databaseUrl);
const db = drizzle(sql);

async function main() {
	console.log("Applying migrations via drizzle-orm/neon-http/migrator...");
	await migrate(db, { migrationsFolder: "./server/src/db/migrations" });
	console.log("Migrations applied successfully.");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Migration failed:", error);
		process.exit(1);
	});
