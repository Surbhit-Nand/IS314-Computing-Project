import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { env } from "../config/env.js";

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation requires a namespace
	namespace Express {
		interface Request {
			clerkUserId?: string;
			clerkOrgId?: string;
		}
	}
}

export {};

// Resolves the signed-in Clerk user id from the Authorization header without
// rejecting the request when there is no token. Used by public endpoints
// (e.g. rescue report submission) that must work for anonymous visitors but
// should still stamp the reporter's account id when they happen to be signed
// in, so they can later track the report from their dashboard.
export async function resolveOptionalClerkUserId(request: Request): Promise<string | undefined> {
	const authorization = request.header("authorization");
	const token = authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: undefined;

	if (!token) {
		return undefined;
	}

	try {
		const payload = await verifyToken(token, { secretKey: env.clerkSecretKey });
		return payload.sub;
	} catch {
		return undefined;
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
