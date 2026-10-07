import type { ReactNode } from "react";
import { countPhoneDigits, dialCodeByCode, expectedLengthLabel } from "../utils/phone";
import { CountryPicker } from "./CountryPicker";

type PhoneInputProps = {
  label: string;
  code: string;
  number: string;
  onCodeChange: (code: string) => void;
  onNumberChange: (number: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: ReactNode;
};

// Flag picker + national number in one row. The digit band, placeholder and
// typing cap all follow the selected nation: switching country immediately
// re-describes what a valid number looks like. The parent owns both halves
// and combines them into the stored `+code number` string on submit (see
// utils/phone.ts formatPhone).
export function PhoneInput({
  label,
  code,
  number,
  onCodeChange,
  onNumberChange,
  placeholder,
  required,
  hint,
}: PhoneInputProps) {
  const band = dialCodeByCode(code);
  const digits = countPhoneDigits(number);
  const inputId = `phone-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <div className="phone-field">
      <span className="form-label-text" id={`${inputId}-label`}>
        {label} {hint}
      </span>
      <div className="phone-row" role="group" aria-labelledby={`${inputId}-label`}>
        <CountryPicker code={code} onChange={onCodeChange} label={`${label} country`} />
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={placeholder ?? `e.g. ${band.example} (${expectedLengthLabel(code)})`}
          value={number}
          maxLength={band.maxLength + Math.ceil(band.maxLength / 3)}
          onChange={(event) => onNumberChange(event.target.value)}
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
