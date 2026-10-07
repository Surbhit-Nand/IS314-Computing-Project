import { db } from "../../db/client.js";
import { donations } from "../../db/schema.js";

export async function createDonationRecord(input: typeof donations.$inferInsert) {
	const [donation] = await db.insert(donations).values(input).returning();
	return donation;
}