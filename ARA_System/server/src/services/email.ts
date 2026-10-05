import { env } from "../config/env.js";

export type AdoptionStatusEmail = {
	to: string;
	animalName: string | null;
	toStatus: string;
	reviewNote?: string | null;
	applicationId: string;
};

export type EmailSendResult = { sent: boolean; reason?: string };

// Vendor abstraction for transactional mail (per AGENTS.md: SDKs stay behind
// server/src/services/, never called from module code directly). Currently
// backed by Resend's HTTPS API so no SMTP dependency is needed. When no
// provider key is configured (local dev, CI) the email is skipped with a log
// line instead of throwing - the in-app notification row is the durable
// record, so callers treat this as best-effort and never fail a business
// write because mail is down.
export async function sendAdoptionStatusEmail(email: AdoptionStatusEmail): Promise<EmailSendResult> {
	if (!env.resendApiKey) {
		console.log(`[email:skipped] no provider configured (to=${email.to} status=${email.toStatus})`);
		return { sent: false, reason: "email provider not configured" };
	}
	const subject = emailSubject(email.toStatus, email.animalName);
	const text = emailBody(email);
	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: env.emailFrom ?? "SPCA Fiji <noreply@spcafiji.org>",
				to: [email.to],
				subject,
				text,
			}),
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			console.error(`[email:failed] provider returned ${response.status} ${detail}`);
			return { sent: false, reason: `provider returned ${response.status}` };
		}
		return { sent: true };
	} catch (error) {
		console.error("[email:failed]", error);
		return { sent: false, reason: error instanceof Error ? error.message : "send failed" };
	}
}

function emailSubject(toStatus: string, animalName: string | null) {
	const who = animalName ?? "your application";
	switch (toStatus) {
		case "submitted":
			return `SPCA Fiji: application received for ${who}`;
		case "under_review":
			return `SPCA Fiji: your application for ${who} is under review`;
		case "approved":
			return `SPCA Fiji: your application for ${who} was approved`;
		case "completed":
			return `SPCA Fiji: adoption of ${who} is complete`;
		case "rejected":
			return `SPCA Fiji: update on your application for ${who}`;
		default:
			return `SPCA Fiji: update on your application for ${who}`;
	}
}

function emailBody(email: AdoptionStatusEmail) {
	const who = email.animalName ?? "the animal";
	const lines = [
		`Hello,`,
		``,
		`Your adoption application for ${who} moved to: ${email.toStatus}.`,
	];
	if (email.toStatus === "rejected" && email.reviewNote?.trim()) {
		lines.push(``, `Our team's note: ${email.reviewNote.trim()}`);
	}
	if (email.toStatus === "approved") {
		lines.push(``, `Our team will contact you about next steps.`);
	}
	lines.push(``, `You can track progress anytime in My applications.`, ``, `SPCA Fiji`);
	return lines.join("\n");
}
