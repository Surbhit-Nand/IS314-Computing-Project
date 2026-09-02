import { insertDonation } from "./donations.repository.js";

export type DonationInput = {
	amountCents: number;
	currency?: string;
	donorName?: string;
	donorEmail?: string;
	message?: string;
};

// Matches the frontend's $1–$10,000 bound shown in the Donate modal.
const MAX_AMOUNT_CENTS = 10_000 * 100;

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

	return {
		amountCents: input.amountCents,
		currency: currency.toUpperCase(),
		donorName: trimOrUndefined(input.donorName),
		donorEmail: trimOrUndefined(input.donorEmail),
		message: trimOrUndefined(input.message),
	};
}

export async function createDonation(input: DonationInput) {
	return insertDonation(normalizeDonationInput(input));
}