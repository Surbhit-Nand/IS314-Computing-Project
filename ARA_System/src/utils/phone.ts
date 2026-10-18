// Curated dial-code list for the phone picker: Fiji first (SPCA Fiji's home),
// then Pacific neighbours, then the most common international sources.
// Flag artwork lives beside the picker component (see
// src/components/flagAssets.ts, vendored MIT `flag-icons` SVGs) so this
// logic module stays asset-free and unit-testable under node.
export type CountryDialCode = {
  iso: string;
  name: string;
  code: string;
  // Valid national-digit counts (excluding the country code). Bands cover
  // fixed-line + mobile (+ trunk-0 variants) so valid landlines are never
  // rejected; Samoa/Vanuatu/Tonga bands are confirmed against regulator
  // numbering plans (fixed 5 / mobile 7), the rest are ITU-typical with
  // margin. NANP (+1) is the one genuinely fixed-length plan.
  minLength: number;
  maxLength: number;
  // Typical number shown as the input placeholder.
  example: string;
};

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { iso: "fj", name: "Fiji", code: "679", minLength: 6, maxLength: 7, example: "9900000" },
  { iso: "ws", name: "Samoa", code: "685", minLength: 5, maxLength: 7, example: "7200000" },
  { iso: "to", name: "Tonga", code: "676", minLength: 5, maxLength: 7, example: "7700000" },
  { iso: "vu", name: "Vanuatu", code: "678", minLength: 5, maxLength: 7, example: "5700000" },
  { iso: "pg", name: "Papua New Guinea", code: "675", minLength: 7, maxLength: 8, example: "70000000" },
  { iso: "sb", name: "Solomon Islands", code: "677", minLength: 5, maxLength: 8, example: "7400000" },
  { iso: "nc", name: "New Caledonia", code: "687", minLength: 5, maxLength: 7, example: "750000" },
  { iso: "au", name: "Australia", code: "61", minLength: 9, maxLength: 10, example: "412345678" },
  { iso: "nz", name: "New Zealand", code: "64", minLength: 8, maxLength: 11, example: "21123456" },
  { iso: "us", name: "USA / Canada", code: "1", minLength: 10, maxLength: 10, example: "2125551234" },
  { iso: "gb", name: "United Kingdom", code: "44", minLength: 10, maxLength: 11, example: "7700900000" },
  { iso: "in", name: "India", code: "91", minLength: 10, maxLength: 11, example: "9876543210" },
  { iso: "cn", name: "China", code: "86", minLength: 7, maxLength: 12, example: "13800138000" },
  { iso: "ph", name: "Philippines", code: "63", minLength: 10, maxLength: 11, example: "9171234567" },
  { iso: "jp", name: "Japan", code: "81", minLength: 9, maxLength: 11, example: "9012345678" },
];

export const DEFAULT_DIAL_CODE = "679";

export function dialCodeByCode(code: string): CountryDialCode {
  return COUNTRY_DIAL_CODES.find((entry) => entry.code === code) ?? COUNTRY_DIAL_CODES[0]!;
}

// Combines a picker selection into the single stored string, e.g. "+679 9900000".
// Stored in the existing text columns (no migration); staff views render it verbatim.
export function formatPhone(code: string, national: string): string {
  return `+${code.trim()} ${national.trim()}`;
}

// National part against its nation's band: digits and spaces only, digit
// count within [minLength, maxLength]. Bands accept fixed + mobile (+ trunk
// variants) - the backend keeps its non-empty check, and staff confirm
// reachability on review.
export function isValidPhoneNational(national: string, code: string = DEFAULT_DIAL_CODE): boolean {
  const trimmed = national.trim();
  if (!/^[0-9\s+\-()]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  const band = dialCodeByCode(code);
  return digits.length >= band.minLength && digits.length <= band.maxLength;
}

// Human label for messages and hints, e.g. "7 digits" or "5–7 digits".
export function expectedLengthLabel(code: string = DEFAULT_DIAL_CODE): string {
  const band = dialCodeByCode(code);
  return band.minLength === band.maxLength
    ? `${band.minLength} digits`
    : `${band.minLength}–${band.maxLength} digits`;
}

// Digit count of the typed national part (for the live counter).
export function countPhoneDigits(national: string): number {
  return national.replace(/\D/g, "").length;
}

// ---- Fiji-only helpers ----------------------------------------------------
// The public rescue alert form drops the country picker, so every reporter
// number is +679 with a 7-digit national part. These helpers normalize what
// the reporter types or pastes and produce the one stored shape.

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

// Live input pass: collapse a recognisable Fiji number to its 7 digits (so a
// pasted "+679 990 0000" lands as "9900000"), otherwise keep the digits the
// reporter typed - minus a leading country code - so submit validation can
// still flag a bad length or another nation's number.
export function normalizeFijiPhoneInput(raw: string): string {
  const digits = normalizeFijiPhone(raw);
  if (digits) return digits;
  let fallback = raw.replace(/\D/g, "");
  if (fallback.length > FIJI_PHONE_DIGITS && fallback.startsWith(FIJI_COUNTRY_CODE)) {
    fallback = fallback.slice(FIJI_COUNTRY_CODE.length);
  }
  return fallback;
}

// Canonical stored form, e.g. "+679 9900000".
export function formatFijiPhone(nationalDigits: string): string {
  return formatPhone(FIJI_COUNTRY_CODE, nationalDigits);
}
