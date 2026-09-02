import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { rescueReports } from "../../db/schema.js";

// Newest reports first so the staff dispatch queue always shows the latest
// intake at the top instead of burying it under older cases.
export async function findAllReports() {
	return db.select().from(rescueReports).orderBy(desc(rescueReports.createdAt));
}

// Every report belonging to one signed-in reporter, for their dashboard.
export async function findReportsByReporter(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(eq(rescueReports.reporterClerkUserId, clerkUserId))
		.orderBy(desc(rescueReports.createdAt));
}

export async function findReportById(id: string) {
	const [report] = await db.select().from(rescueReports).where(eq(rescueReports.id, id));
	return report;
}

// Public tracking lookup by the reference code given to the reporter.
export async function findReportByReference(reference: string) {
	const [report] = await db
		.select()
		.from(rescueReports)
		.where(eq(rescueReports.reference, reference));
	return report;
}

export async function createRescueReport(input: typeof rescueReports.$inferInsert) {
	const [report] = await db.insert(rescueReports).values(input).returning();
	return report;
}

// Updates only the fields provided in `input` and always refreshes updatedAt.
export async function updateRescueReport(id: string, input: Partial<typeof rescueReports.$inferInsert>) {
	const [report] = await db
		.update(rescueReports)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(rescueReports.id, id))
		.returning();
	return report;
}