import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { db } from "./client.js";
import {
	adoptionApplications,
	animals,
	auditLogs,
	donations,
	rescueReports,
	vetAppointments,
} from "./schema.js";

// The six tables the app owns. Kept explicit (rather than reflecting over the
// schema module) so enum objects never leak into the column comparison.
const tables = [
	animals,
	rescueReports,
	adoptionApplications,
	vetAppointments,
	auditLogs,
	donations,
] as const;

type ColumnRow = { table_name: string; column_name: string };

// Compares the columns defined in schema.ts against the live database and
// returns the schema columns that are missing there. Extra DB columns (e.g. a
// soft-delete column added by another branch on the shared Neon DB) are
// expected and ignored.
export async function findMissingColumns(): Promise<string[]> {
	const result = (await db.execute(sql`
		SELECT table_name, column_name
		FROM information_schema.columns
		WHERE table_schema = 'public'
	`)) as { rows: ColumnRow[] };

	const live = new Set(
		result.rows.map((row) => `${row.table_name}.${row.column_name}`),
	);

	const missing: string[] = [];
	for (const table of tables) {
		const tableName = getTableName(table);
		for (const column of Object.values(getTableColumns(table))) {
			const qualified = `${tableName}.${column.name}`;
			if (!live.has(qualified)) missing.push(qualified);
		}
	}
	return missing;
}

// Non-fatal schema-drift warning for the server boot log. Reports schema
// columns absent from the live DB — the classic `NeonHttpPreparedQuery`
// "column ... does not exist" crash cause — without ever throwing, so a
// blip in the check can't take the API down.
export async function warnOnSchemaDrift(): Promise<void> {
	const missing = await findMissingColumns();
	if (missing.length === 0) return;
	console.warn(
		`[schema-drift] The live database is missing ${missing.length} column(s) ` +
			`defined in schema.ts: ${missing.join(", ")}. ` +
			"Run `npm run db:migrate` and restart the API.",
	);
}