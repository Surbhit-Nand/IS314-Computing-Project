import { Router } from "express";
import { requireClerkSession } from "../../middleware/auth.js";
import {
	getUnreadCount,
	listMyNotifications,
	markAllRead,
	markRead,
} from "./notifications.service.js";

export const notificationsRouter = Router();

// All routes sit behind requireClerkSession and scope by the session's Clerk
// id - the recipient is never taken from the body or query string, so users
// can only ever read or mutate their own inbox.
notificationsRouter.get("/mine", requireClerkSession, async (request, response, next) => {
	try {
		response.json(await listMyNotifications(request.clerkUserId as string));
	} catch (error) {
		next(error);
	}
});

notificationsRouter.get("/unread-count", requireClerkSession, async (request, response, next) => {
	try {
		response.json({ count: await getUnreadCount(request.clerkUserId as string) });
	} catch (error) {
		next(error);
	}
});

notificationsRouter.patch("/:id/read", requireClerkSession, async (request, response, next) => {
	try {
		const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
		const notification = await markRead(id, request.clerkUserId as string);
		if (!notification) {
			response.status(404).json({ error: "Notification not found" });
			return;
		}
		response.json(notification);
	} catch (error) {
		next(error);
	}
});

notificationsRouter.patch("/read-all", requireClerkSession, async (request, response, next) => {
	try {
		await markAllRead(request.clerkUserId as string);
		response.json({ ok: true });
	} catch (error) {
		next(error);
	}
});
