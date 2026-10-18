import {
	countUnreadNotifications,
	createNotification,
	findNotificationsByRecipient,
	markAllNotificationsRead,
	markNotificationRead,
} from "./notifications.repository.js";
import { clerkClient } from "../../services/clerkClient.js";
import { normalizeRole } from "../../shared/types/roles.js";
import { findTakeoverRequestById } from "../rescue/rescue.repository.js";

async function hasVeterinaryAccess(userId: string) {
	try { const user = await clerkClient.users.getUser(userId); return normalizeRole(user.publicMetadata.role) === "veterinarian" && !user.banned && !user.locked; }
	catch { return false; } // Fail closed for emergency details; ordinary inbox remains available.
}

export async function listMyNotifications(clerkUserId: string, dependencies: {
	access: typeof hasVeterinaryAccess;
	find: typeof findNotificationsByRecipient;
	count: typeof countUnreadNotifications;
	takeover?: typeof findTakeoverRequestById;
} = {
	access: hasVeterinaryAccess, find: findNotificationsByRecipient, count: countUnreadNotifications,
}) {
	const veterinaryAccess = await dependencies.access(clerkUserId);
	const [items, unreadCount] = await Promise.all([
		dependencies.find(clerkUserId, 30, veterinaryAccess),
		dependencies.count(clerkUserId, veterinaryAccess),
	]);
	const enrichedItems = await Promise.all(
		items.map(async (item) => {
			if (!item.actionId || !item.type.startsWith("rescue.takeover_")) {
				return {
					...item,
					takeoverRequestStatus: null,
					takeoverRequestMissionId: null,
				};
			}
			const request = await (dependencies.takeover ?? findTakeoverRequestById)(item.actionId);
			const belongsToRecipient =
				request &&
				(request.assignedToClerkUserId === clerkUserId ||
					request.requestedByClerkUserId === clerkUserId);
			return {
				...item,
				takeoverRequestStatus: belongsToRecipient ? request.status : null,
				takeoverRequestMissionId: belongsToRecipient ? request.reportId : null,
			};
		}),
	);
	return { items: enrichedItems, unreadCount };
}

export async function createAdoptionStatusNotification(input: {
	recipientClerkUserId: string;
	animalName: string | null;
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
	return markNotificationRead(id, clerkUserId, await hasVeterinaryAccess(clerkUserId));
}

export async function markEveryNotificationRead(clerkUserId: string) {
	await markAllNotificationsRead(clerkUserId, await hasVeterinaryAccess(clerkUserId));
}

// Staff-facing: a new adoption application needs review. One row per staff
// member so each inbox tracks its own read state.
export async function createAdoptionSubmittedStaffNotifications(input: {
	staffClerkUserIds: string[];
	animalName: string | null;
	applicantName: string | null;
	applicationId: string;
}) {
	const who = input.animalName ?? "an animal";
	const by = input.applicantName?.trim() ? ` from ${input.applicantName.trim()}` : "";
	const created = [];
	for (const recipientClerkUserId of input.staffClerkUserIds) {
		created.push(
			await createNotification({
				recipientClerkUserId,
				type: "adoption.submitted",
				title: `New adoption application for ${who}`,
				body: `A new application${by} is waiting for review.`,
				entityType: "adoption_application",
				entityId: input.applicationId,
			}),
		);
	}
	return created;
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
