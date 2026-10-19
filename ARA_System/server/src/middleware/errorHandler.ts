import type { NextFunction, Request, Response } from "express";

// Reads the HTTP status out of a thrown value. Body-parser (malformed JSON) and
// Clerk (missing or bad webhook headers) attach `status` or `statusCode` to the
// errors they hand to `next()`. Only 4xx values count as client errors: a thrown
// 5xx is still a server-side fault, so its details stay out of the response.
function clientErrorStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) {
		return undefined;
	}

	const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
	for (const candidate of [status, statusCode]) {
		if (typeof candidate === "number" && candidate >= 400 && candidate < 500) {
			return candidate;
		}
	}

	return undefined;
}

// Terminal Express error middleware; must be mounted last, after every router.
//
// Anything a route forwards via `next(error)` ends up here. A client error keeps
// its own status and message so a malformed body is reported as 400 rather than
// as a server failure; every other error is a genuine fault, so it is logged
// with its details and answered with a bare 500.
export function apiErrorHandler(
	error: unknown,
	_request: Request,
	response: Response,
	next: NextFunction,
) {
	void next;

	const status = clientErrorStatus(error);
	if (status !== undefined) {
		const { message } = error as { message?: unknown };
		response
			.status(status)
			.json({ error: typeof message === "string" && message.trim() ? message : "Invalid request" });
		return;
	}

	console.error("API request failed", error);
	response.status(500).json({ error: "Internal server error" });
}
