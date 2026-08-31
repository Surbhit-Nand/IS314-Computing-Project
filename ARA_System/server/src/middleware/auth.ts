import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { env } from "../config/env.js";

declare global {
	namespace Express {
		interface Request {
			clerkUserId?: string;
			clerkOrgId?: string;
		}
	}
}

export async function requireClerkSession(
	request: Request,
	response: Response,
	next: NextFunction,
) {
	const authorization = request.header("authorization");
	const token = authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: undefined;

	if (!token) {
		response.status(401).json({ error: "Authentication is required" });
		return;
	}

	try {
		const payload = await verifyToken(token, { secretKey: env.clerkSecretKey });
		if (!payload.sub) {
			response.status(401).json({ error: "Invalid Clerk session" });
			return;
		}

		request.clerkUserId = payload.sub;
		// Extract organization ID if the user is in an org context
		if (payload.o && typeof payload.o === "object" && "id" in payload.o) {
			request.clerkOrgId = (payload.o as { id: string }).id;
		}
		next();
	} catch {
		response.status(401).json({ error: "Invalid Clerk session" });
	}
}
