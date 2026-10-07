import { useEffect, useId, useRef, useState } from "react";
import { COUNTRY_DIAL_CODES, dialCodeByCode } from "../utils/phone";
import { FLAG_BY_ISO } from "./flagAssets";

type CountryPickerProps = {
  code: string;
  onChange: (code: string) => void;
  label: string;
};

// Flag-first country dial-code picker. A native <select> cannot render images,
// so this is a button + listbox with the same keyboard contract (arrows move,
// Enter picks, Escape closes). The trigger shows flag + code; rows show flag +
// name + code. A missing flag image falls back to code text so a bad asset
// never blanks a row.
export function CountryPicker({ code, onChange, label }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [brokenFlags, setBrokenFlags] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = dialCodeByCode(code);

  // Click-outside closes the list.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open ]);

  function flagImage(iso: string) {
    if (brokenFlags[iso]) return null;
    return (
      <img
        src={FLAG_BY_ISO[iso]}
        alt=""
        aria-hidden="true"
        className="country-flag"
        onError={() => setBrokenFlags((previous) => ({ ...previous, [iso]: true }))}
      />
    );
  }

  function pick(entry: (typeof COUNTRY_DIAL_CODES)[number]) {
    onChange(entry.code);
    setOpen(false);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setHighlight(Math.max(0, COUNTRY_DIAL_CODES.findIndex((entry) => entry.code === code)));
      setOpen(true);
    }
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index) => (index + delta + COUNTRY_DIAL_CODES.length) % COUNTRY_DIAL_CODES.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(COUNTRY_DIAL_CODES[highlight]!);
    }
  }

  return (
    <div ref={rootRef} className="country-picker">
      <button
        type="button"
        className="country-trigger"
        aria-label={`${label}: ${selected.name} +${selected.code}. Activate to change country.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setHighlight(Math.max(0, COUNTRY_DIAL_CODES.findIndex((entry) => entry.code === code)));
          setOpen((wasOpen) => !wasOpen);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {flagImage(selected.iso)}
        <span className="country-code">+{selected.code}</span>
        <span aria-hidden="true" className="country-caret">▾</span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="country-list"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          ref={(element) => element?.focus()}
        >
          {COUNTRY_DIAL_CODES.map((entry, index) => (
            <li key={entry.iso} role="option" aria-selected={entry.code === code}>
              <button
                type="button"
                className={index === highlight ? "country-option highlight" : "country-option"}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(entry)}
                onFocus={() => setHighlight(index)}
              >
                {flagImage(entry.iso)}
                <span className="country-name">{entry.name}</span>
                <span className="country-code">+{entry.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
