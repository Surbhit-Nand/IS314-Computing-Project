import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { notifications } from "../../db/schema.js";

// Recipient-scoped reads: every query filters on recipient_clerk_user_id so a
// caller can only ever see their own rows. Routes pass the Clerk session id.
export async function findNotificationsByRecipient(recipientClerkUserId: string, limit = 30) {
	return db
		.select()
		.from(notifications)
		.where(eq(notifications.recipientClerkUserId, recipientClerkUserId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function countUnreadNotifications(recipientClerkUserId: string) {
	const rows = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.recipientClerkUserId, recipientClerkUserId),
				isNull(notifications.readAt),
			),
		);
	return rows.length;
}

export async function createNotification(input: typeof notifications.$inferInsert) {
	const [notification] = await db.insert(notifications).values(input).returning();
	return notification;
}

// Marks one row read, but only if it belongs to the caller (recipient guard
// in the WHERE clause, so a forged id returns undefined -> 404, not 403 leak).
export async function markNotificationRead(id: string, recipientClerkUserId: string) {
	const [notification] = await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notifications.id, id),
				eq(notifications.recipientClerkUserId, recipientClerkUserId),
			),
		)
		.returning();
	return notification;
}

export async function markAllNotificationsRead(recipientClerkUserId: string) {
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notifications.recipientClerkUserId, recipientClerkUserId),
				isNull(notifications.readAt),
			),
		);
}
