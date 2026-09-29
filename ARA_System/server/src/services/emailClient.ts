import { env } from "../config/env.js";

// Email delivery behind a service-layer abstraction (see AGENTS.md
// "vendor-lock-in risks"): the rest of the app calls sendEmail() and never
// touches the Resend SDK or REST shape directly, so the provider can be
// swapped without hunting call sites. Implemented over plain fetch against
// the Resend emails API so no extra dependency is needed.
//
// Disabled by default: when RESEND_API_KEY is absent (local dev, CI) every
// call resolves false and nothing is sent - notifications stay in-app only.
export const isEmailConfigured = () => Boolean(env.resendApiKey);

export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
	if (!env.resendApiKey) {
		return false;
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.resendApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: env.emailFrom,
			to: input.to,
			subject: input.subject,
			text: input.text,
		}),
	});

	if (!response.ok) {
		throw new Error(`Resend rejected the email (${response.status})`);
	}
	return true;
}
