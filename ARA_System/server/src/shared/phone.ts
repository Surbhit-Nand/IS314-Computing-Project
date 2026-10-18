// Fiji-only reporter phone helpers. SPCA Fiji captures local numbers, so the
// rescue form is locked to +679 and every stored value uses the one canonical
// "+679 NNNNNNN" shape (7 national digits). Kept in shared so the route schema
// and any future caller validate identically.

export const FIJI_COUNTRY_CODE = "679";
export const FIJI_PHONE_DIGITS = 7;
export const FIJI_PHONE_ERROR = "Enter a valid 7-digit Fiji phone number.";

// Returns the 7 national digits for any Fiji number, or null when it is a
// different country's code or the wrong length. Accepts "9900000",
// "990 0000", "6799900000" and "+679 990 0000".
export function normalizeFijiPhone(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const compact = trimmed.replace(/[\s\-().]/g, "");
	let digits: string;
	if (compact.startsWith("+")) {
		if (!compact.startsWith(`+${FIJI_COUNTRY_CODE}`)) return null;
		digits = compact.slice(FIJI_COUNTRY_CODE.length + 1);
	} else {
		digits = compact;
		if (digits.length > FIJI_PHONE_DIGITS && digits.startsWith(FIJI_COUNTRY_CODE)) {
			digits = digits.slice(FIJI_COUNTRY_CODE.length);
		}
	}
	digits = digits.replace(/\D/g, "");
	return digits.length === FIJI_PHONE_DIGITS ? digits : null;
}

export function isValidFijiPhone(raw: string): boolean {
	return normalizeFijiPhone(raw) !== null;
}

// Canonical stored form, e.g. "+679 9900000".
export function formatFijiPhone(nationalDigits: string): string {
	return `+${FIJI_COUNTRY_CODE} ${nationalDigits}`;
}
