import express, { Router } from "express";
import type { Request as ExpressRequest } from "express";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { env } from "../config/env.js";
import { handleUserCreated } from "./webhooks.service.js";

export const webhooksRouter = Router();

// verifyWebhook expects a standard Web Fetch API Request (not an Express
// request) built from the exact raw body bytes. Rebuild one after
// express.raw() has captured the buffer - express.json() would have lost the
// bytes needed to check the signature.
function toFetchRequest(request: ExpressRequest): Request {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (typeof value === "string") {
			headers.set(name, value);
		}
	}

	const rawBody = request.body;
	const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : undefined;

	return new Request(`http://localhost${request.originalUrl}`, {
		method: request.method,
		headers,
		body,
	});
}

// Clerk webhook receiver. Must stay public (no requireClerkSession), because
// Clerk/Svix signs the payload and authenticates via the signing secret, not
// a session token.
webhooksRouter.post(
	"/",
	express.raw({ type: "application/json" }),
	async (request, response) => {
		let event: Awaited<ReturnType<typeof verifyWebhook>>;
		try {
			event = await verifyWebhook(toFetchRequest(request), {
				signingSecret: env.clerkWebhookSigningSecret,
			});
		} catch (error) {
			console.error(
				"[WEBHOOK_VERIFICATION_FAILED]",
				error instanceof Error ? error.message : error,
			);
			response.status(400).json({ error: "Webhook verification failed" });
			return;
		}

		try {
			if (event.type === "user.created") {
				await handleUserCreated(
					event.data.id,
					event.data.email_addresses,
					event.data.public_metadata,
				);
			}
			response.json({ received: true });
		} catch (error) {
			console.error(
				"[WEBHOOK_HANDLER_FAILED]",
				error instanceof Error ? error.message : error,
			);
			response.status(500).json({ error: "Webhook handler failed" });
		}
	},
);