// Typed business-rule errors for the adoption module.
//
// Before this existed, the route mapped errors to HTTP status codes by
// pattern-matching English strings ("Another applicant has already
// approved..." -> 409). That is fragile: rewording a message silently turned
// a 409 into a 500. Every rule now throws an AdoptionBusinessError that
// carries its own status, so the mapping can never drift from the message.
//
// 400 - the request is understood but the state forbids it (invalid move,
//       not cleared, health gate, missing rejection note, unavailable animal)
// 403 - the caller is authenticated but not allowed to do this to *this*
//       application (self-approval)
// 404 - there is no such application
// 409 - a genuine conflict (another application for the animal is already
//       approved/completed), including the database unique-violation race
export type AdoptionErrorStatus = 400 | 403 | 404 | 409;

export class AdoptionBusinessError extends Error {
	readonly status: AdoptionErrorStatus;

	constructor(status: AdoptionErrorStatus, message: string) {
		super(message);
		this.name = "AdoptionBusinessError";
		this.status = status;
	}
}

// Postgres unique-violation. The partial unique index
// (adoption_animal_unique_active) is the real guarantee that only one
// application per animal can be approved: a concurrent second approval hits
// 23505 instead of being stopped by the friendly pre-check. The driver
// (neon-http) surfaces that as an error whose `code` is "23505"; Drizzle may
// wrap it, so walk the `cause` chain and fall back to the message text.
export function isUniqueViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth += 1) {
		if (typeof current === "object") {
			const code = (current as { code?: unknown }).code;
			if (code === "23505") {
				return true;
			}
			const message = (current as { message?: unknown }).message;
			if (
				typeof message === "string" &&
				/(duplicate key value|adoption_animal_unique_active)/i.test(message)
			) {
				return true;
			}
		}
		current = (current as { cause?: unknown } | undefined)?.cause;
	}
	return false;
}

// Maps any thrown value to the HTTP status the route should return, or null
// to fall through to the app-level 500 handler.
export function adoptionErrorStatus(error: unknown): number | null {
	if (error instanceof AdoptionBusinessError) {
		return error.status;
	}
	if (isUniqueViolation(error)) {
		// Two concurrent approvals for one animal: the index fired. This is the
		// documented 409, not an unknown 500.
		return 409;
	}
	return null;
}

export function adoptionErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof AdoptionBusinessError) {
		return error.message;
	}
	if (isUniqueViolation(error)) {
		return "Another applicant has already been approved for this animal.";
	}
	return error instanceof Error ? error.message : fallback;
}
