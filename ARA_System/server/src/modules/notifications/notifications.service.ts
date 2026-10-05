import {
	countUnreadNotifications,
	createNotification,
	findNotificationsByRecipient,
	markAllNotificationsRead,
	markNotificationRead,
} from "./notifications.repository.js";

export async function listMyNotifications(clerkUserId: string) {
	const [items, unreadCount] = await Promise.all([
		findNotificationsByRecipient(clerkUserId),
		countUnreadNotifications(clerkUserId),
	]);
	return { items, unreadCount };
}

export async function createAdoptionStatusNotification(input: {
	recipientClerkUserId: string;
	animalName: string | null;
	fromStatus: string;
	toStatus: string;
	reviewNote?: string | null;
	applicationId: string;
}) {
	const title = notificationTitle(input.toStatus, input.animalName);
	return createNotification({
		recipientClerkUserId: input.recipientClerkUserId,
		type: "adoption.status_changed",
		title,
		body: notificationBody(input.toStatus, input.animalName, input.reviewNote),
		entityType: "adoption_application",
		entityId: input.applicationId,
	});
}

export async function markOneNotificationRead(id: string, clerkUserId: string) {
	return markNotificationRead(id, clerkUserId);
}

export async function markEveryNotificationRead(clerkUserId: string) {
	await markAllNotificationsRead(clerkUserId);
}

function notificationTitle(toStatus: string, animalName: string | null) {
	const who = animalName ?? "your application";
	switch (toStatus) {
		case "submitted":
			return `Application received for ${who}`;
		case "under_review":
			return `Your application for ${who} is under review`;
		case "approved":
			return `Your application for ${who} was approved`;
		case "completed":
			return `Adoption of ${who} is complete`;
		case "rejected":
			return `Update on your application for ${who}`;
		default:
			return `Update on your application for ${who}`;
	}
}

function notificationBody(
	toStatus: string,
	animalName: string | null,
	reviewNote?: string | null,
) {
	const who = animalName ?? "the animal";
	switch (toStatus) {
		case "submitted":
			return `We received your application to adopt ${who}. Our team will review it soon.`;
		case "under_review":
			return `A staff member is now reviewing your application to adopt ${who}.`;
		case "approved":
			return `Your application to adopt ${who} was approved. Our team will contact you about next steps.`;
		case "completed":
			return `The adoption of ${who} is complete. Thank you for giving them a home.`;
		case "rejected":
			return reviewNote?.trim()
				? `Our team decided not to proceed: ${reviewNote.trim()}`
				: `Our team decided not to proceed with your application for ${who}.`;
		default:
			return `Your application for ${who} moved to ${toStatus}.`;
	}
}
