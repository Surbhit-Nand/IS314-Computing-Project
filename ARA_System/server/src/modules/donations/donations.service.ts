import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { createDonationRecord } from "./donations.repository.js";

export type DonationInput = {
	amountCents: number;
	currency?: string;
	donorName?: string;
	donorEmail?: string;
	message?: string;
};

export type NormalizedDonation = {
	amountCents: number;
	currency: string;
	donorName: string;
	donorEmail: string;
	message: string;
};

// Matches the frontend's $1–$10,000 bound shown in the Donate modal.
const MAX_AMOUNT_CENTS = 10_000 * 100;

function trimOrUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === "" ? undefined : trimmed;
}

// Validates and normalizes a donation payload coming from the frontend.
// Exported for the unit tests in donations.service.test.ts.
export function normalizeDonationInput(input: DonationInput): NormalizedDonation {
	const amountCents = Number(input.amountCents);
	if (!Number.isInteger(amountCents) || amountCents < 1) {
		throw new Error("Donation amount must be at least $0.01");
	}
	if (amountCents > MAX_AMOUNT_CENTS) {
		throw new Error("Donation amount cannot exceed $10,000");
	}

	const currency = trimOrUndefined(input.currency) ?? "USD";
	if (!/^[A-Za-z]{3}$/.test(currency)) {
		throw new Error("Donation currency must be a 3-letter code");
	}

	return {
		amountCents,
		currency: currency.toUpperCase(),
		donorName: (input.donorName ?? "").trim(),
		donorEmail: (input.donorEmail ?? "").trim(),
		message: (input.message ?? "").trim(),
	};
}

// Records a donation. Works for anonymous visitors and signed-in donors -
// when the donor is signed in their Clerk id is stamped and an audit entry is
// written, mirroring how rescue reports keep an audit trail for logged-in
// actors while staying usable for the public.
export async function createDonation(
	input: DonationInput,
	options: { actorClerkUserId?: string } = {},
) {
	const normalized = normalizeDonationInput(input);
	const donation = await createDonationRecord({
		...normalized,
		donorClerkUserId: options.actorClerkUserId ?? null,
		donorName: trimOrUndefined(normalized.donorName) ?? null,
		donorEmail: trimOrUndefined(normalized.donorEmail) ?? null,
		message: trimOrUndefined(normalized.message) ?? null,
	});

	if (options.actorClerkUserId) {
		await logAuditEntry({
			actorClerkUserId: options.actorClerkUserId,
			action: "donation.created",
			entityType: "donation",
			entityId: donation.id,
			metadata: {
				amountCents: donation.amountCents,
				currency: donation.currency,
			},
		});
	}

	return donation;
}