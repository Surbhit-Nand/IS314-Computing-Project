import type { NextFunction, Request, Response } from "express";
import { clerkClient } from "../services/clerkClient.js";

export function requireManagerOrAdmin(
	request: Request,
	response: Response,
	next: NextFunction,
) {
	void (async () => {
		if (!request.clerkUserId) {
			response.status(401).json({ error: "Authentication is required" });
			return;
		}

		const user = await clerkClient.users.getUser(request.clerkUserId);
		const role = user.publicMetadata.role;

		if (role !== "manager" && role !== "admin") {
			response.status(403).json({ error: "Manager or admin access is required" });
			return;
		}

		next();
	})().catch(next);
}
