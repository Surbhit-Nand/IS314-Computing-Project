import {
	createNotification,
	findNotificationsByRecipient,
	findUnreadNotificationCount,
	markAllNotificationsRead,
	markNotificationRead,
} from "./notifications.repository.js";
import { clerkClient } from "../../services/clerkClient.js";
import { sendEmail } from "../../services/emailClient.js";

export type NotifyUserInput = {
	recipientClerkUserId: string;
	type: string;
	title: string;
	body?: string | null;
	entityType?: string | null;
	entityId?: string | null;
};

// The single funnel for every in-app notification (adoption status changes,
// rescue status changes, vet appointment updates). Writes the row that the
// bell polls, then sends an email copy on top when Resend is configured -
// the row is the record, email is just a copy. The whole email leg is
// best-effort: a missing address, an unconfigured key, or a Resend failure
// never fails the call (and therefore never fails the transition that
// triggered it).
export async function notifyUser(input: NotifyUserInput) {
	const notification = await createNotification({
		recipientClerkUserId: input.recipientClerkUserId,
		type: input.type,
		title: input.title,
		body: input.body ?? null,
		entityType: input.entityType ?? null,
		entityId: input.entityId ?? null,
		isRead: false,
	});

	try {
		const user = await clerkClient.users.getUser(input.recipientClerkUserId);
		const email = user.primaryEmailAddress?.emailAddress;
		if (email) {
			await sendEmail({
				to: email,
				subject: `SPCA Fiji: ${input.title}`,
				text: input.body ? `${input.title}\n\n${input.body}` : input.title,
			});
		}
	} catch {
		// Best-effort only - the notification row already exists.
	}

	return notification;
}

// Email-only path for people with no Clerk account and therefore no inbox:
// anonymous rescue reporters who left an email address. There is no
// notification row - the email IS the notification.
export async function notifyEmailAddress(input: {
	email: string;
	title: string;
	body?: string | null;
}): Promise<boolean> {
	try {
		return await sendEmail({
			to: input.email,
			subject: `SPCA Fiji: ${input.title}`,
			text: input.body ? `${input.title}\n\n${input.body}` : input.title,
		});
	} catch {
		return false;
	}
}

export async function listMyNotifications(recipientClerkUserId: string) {
	return findNotificationsByRecipient(recipientClerkUserId);
}

export async function getUnreadCount(recipientClerkUserId: string) {
	return findUnreadNotificationCount(recipientClerkUserId);
}

export async function markRead(id: string, recipientClerkUserId: string) {
	return markNotificationRead(id, recipientClerkUserId);
}

export async function markAllRead(recipientClerkUserId: string) {
	await markAllNotificationsRead(recipientClerkUserId);
}
