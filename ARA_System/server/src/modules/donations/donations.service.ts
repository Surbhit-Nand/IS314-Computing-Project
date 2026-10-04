import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { createDonationRecord } from "./donations.repository.js";

export type DonationInput = {
	amountCents: number;
	currency?: string;
	donorName?: string;
	donorEmail?: string;
	message?: string;
	paymentMethod?: string;
};

// Matches the frontend's $1–$10,000 bound shown in the Donate modal.
const MAX_AMOUNT_CENTS = 10_000 * 100;

// Payment methods wired into the Donate modal's toggle.
const PAYMENT_METHODS = ["card", "qr"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function trimOrUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === "" ? undefined : trimmed;
}

// Validates and normalizes a donation payload coming from the frontend.
// Exported for the unit tests in donations.service.test.ts.
export function normalizeDonationInput(input: DonationInput) {
	if (!Number.isInteger(input.amountCents) || input.amountCents < 1) {
		throw new Error("Donation amount must be at least $0.01");
	}
	if (input.amountCents > MAX_AMOUNT_CENTS) {
		throw new Error("Donation amount cannot exceed $10,000");
	}

	const currency = trimOrUndefined(input.currency) ?? "USD";
	if (!/^[A-Za-z]{3}$/.test(currency)) {
		throw new Error("Donation currency must be a 3-letter code");
	}

	const paymentMethod = trimOrUndefined(input.paymentMethod) ?? "card";
	if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
		throw new Error("Donation payment method is not supported");
	}

	return {
		amountCents: input.amountCents,
		currency: currency.toUpperCase(),
		donorName: trimOrUndefined(input.donorName),
		donorEmail: trimOrUndefined(input.donorEmail),
		message: trimOrUndefined(input.message),
		paymentMethod: paymentMethod as PaymentMethod,
	};
}

export async function createDonation(
	input: DonationInput,
	options: { actorClerkUserId?: string } = {},
) {
	const normalized = normalizeDonationInput(input);
	const donation = await createDonationRecord({
		...normalized,
		donorClerkUserId: options.actorClerkUserId ?? null,
		donorName: normalized.donorName ?? null,
		donorEmail: normalized.donorEmail ?? null,
		message: normalized.message ?? null,
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