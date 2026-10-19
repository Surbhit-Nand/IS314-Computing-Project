import type { ReactNode } from "react";
import {
  countPhoneDigits,
  dialCodeByCode,
  expectedLengthLabel,
  sanitizePhoneNational,
  FIJI_COUNTRY_CODE,
  FIJI_PHONE_DIGITS,
  normalizeFijiPhoneInput,
} from "../utils/phone";
import { CountryPicker } from "./CountryPicker";

type PhoneInputProps = {
  label: string;
  code?: string;
  number: string;
  onCodeChange?: (code: string) => void;
  onNumberChange: (number: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: ReactNode;
  // Fiji-only mode: no country picker, a fixed +679 prefix, and the national
  // part is normalized to 7 digits on typing/paste. Used by the rescue form.
  fijiOnly?: boolean;
};

// Flag picker + national number in one row. The digit band, placeholder and
// typing cap all follow the selected nation: switching country immediately
// re-describes what a valid number looks like. The parent owns both halves
// and combines them into the stored `+code number` string on submit (see
// utils/phone.ts formatPhone). In `fijiOnly` mode the picker is replaced by a
// static +679 prefix and the number is Fiji-locked.
export function PhoneInput({
  label,
  code = FIJI_COUNTRY_CODE,
  number,
  onCodeChange,
  onNumberChange,
  placeholder,
  required,
  hint,
  fijiOnly,
}: PhoneInputProps) {
  const band = dialCodeByCode(code);
  const digits = countPhoneDigits(number);
  const inputId = `phone-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

  if (fijiOnly) {
    return (
      <div className="phone-field">
        <span className="form-label-text" id={`${inputId}-label`}>
          {label} {hint}
        </span>
        <div className="phone-row" role="group" aria-labelledby={`${inputId}-label`}>
          <span className="phone-prefix" aria-hidden="true">+{FIJI_COUNTRY_CODE}</span>
          <input
            id={inputId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder={placeholder ?? `e.g. ${band.example} (${FIJI_PHONE_DIGITS} digits)`}
            value={number}
            maxLength={20}
            onChange={(event) => onNumberChange(normalizeFijiPhoneInput(event.target.value))}
            required={required}
            aria-describedby={`${inputId}-hint`}
          />
        </div>
        <span id={`${inputId}-hint`} className="phone-hint">
          Fiji: {FIJI_PHONE_DIGITS} digits
          {number.trim() !== "" && ` · ${digits} entered`}
        </span>
      </div>
    );
  }

  return (
    <div className="phone-field">
      <span className="form-label-text" id={`${inputId}-label`}>
        {label} {hint}
      </span>
      <div className="phone-row" role="group" aria-labelledby={`${inputId}-label`}>
        <CountryPicker code={code} onChange={(next) => onCodeChange?.(next)} label={`${label} country`} />
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={placeholder ?? `e.g. ${band.example} (${expectedLengthLabel(code)})`}
          value={number}
          maxLength={band.maxLength + Math.ceil(band.maxLength / 3)}
          onChange={(event) => onNumberChange(sanitizePhoneNational(event.target.value))}
          required={required}
          aria-describedby={`${inputId}-hint`}
        />
      </div>
      <span id={`${inputId}-hint`} className="phone-hint">
        {band.name}: {expectedLengthLabel(code)}
        {number.trim() !== "" && ` · ${digits} entered`}
      </span>
    </div>
  );
}
