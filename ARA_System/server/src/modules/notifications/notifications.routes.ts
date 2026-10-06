import { Router } from "express";
import { requireClerkSession } from "../../middleware/auth.js";
import {
	listMyNotifications,
	markEveryNotificationRead,
	markOneNotificationRead,
} from "./notifications.service.js";

function getIdParam(value: string | string[]): string {
	return Array.isArray(value) ? value[0] : value;
}

export const notificationsRouter = Router();

// Signed-in user: their own notifications, newest first, plus unread count
// for the header bell badge.
notificationsRouter.get("/mine", requireClerkSession, async (request, response, next) => {
	try {
		response.json(await listMyNotifications(request.clerkUserId as string));
	} catch (error) {
		next(error);
	}
});

// Signed-in user: mark every own notification read (bell "mark all read").
notificationsRouter.patch("/read-all", requireClerkSession, async (request, response, next) => {
	try {
		await markEveryNotificationRead(request.clerkUserId as string);
		response.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// Signed-in user: mark one own notification read. A forged id (or someone
// else's row) resolves to undefined -> 404, never leaks another row.
notificationsRouter.patch("/:id/read", requireClerkSession, async (request, response, next) => {
	try {
		const notification = await markOneNotificationRead(
			getIdParam(request.params.id),
			request.clerkUserId as string,
		);
		if (!notification) {
			response.status(404).json({ error: "Notification not found" });
			return;
		}
		response.json(notification);
	} catch (error) {
		next(error);
	}
});
