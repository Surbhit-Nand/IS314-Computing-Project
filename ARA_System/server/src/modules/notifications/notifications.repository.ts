import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { notifications } from "../../db/schema.js";

// The signed-in recipient's inbox, newest first. Scoped by Clerk user id so
// one user can never read another's notifications.
export async function findNotificationsByRecipient(recipientClerkUserId: string, limit = 50) {
	return db
		.select()
		.from(notifications)
		.where(eq(notifications.recipientClerkUserId, recipientClerkUserId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function findUnreadNotificationCount(recipientClerkUserId: string) {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(
			and(
				eq(notifications.recipientClerkUserId, recipientClerkUserId),
				eq(notifications.isRead, false),
			),
		);
	return row?.count ?? 0;
}

export async function createNotification(input: typeof notifications.$inferInsert) {
	const [notification] = await db.insert(notifications).values(input).returning();
	return notification;
}

// Mark-read is recipient-scoped: the update only matches when both the row id
// AND the session's Clerk id match, so a user cannot mark another user's
// notification as read (the call simply returns undefined).
export async function markNotificationRead(id: string, recipientClerkUserId: string) {
	const [notification] = await db
		.update(notifications)
		.set({ isRead: true })
		.where(
			and(eq(notifications.id, id), eq(notifications.recipientClerkUserId, recipientClerkUserId)),
		)
		.returning();
	return notification;
}

export async function markAllNotificationsRead(recipientClerkUserId: string) {
	await db
		.update(notifications)
		.set({ isRead: true })
		.where(eq(notifications.recipientClerkUserId, recipientClerkUserId));
}
