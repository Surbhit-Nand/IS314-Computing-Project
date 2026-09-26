import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconArrowRight, IconCalendar, IconCheck, IconClock } from "../../../components/MedicalIcons";
import { fmtDate, todayInputParts, toDateInputParts } from "./vetHelpers";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Clinic opening hours by weekday. Sunday is a closed day.
// Mon-Fri 08:00-16:00, Sat 08:00-12:00, Sun closed (null).
function officeHours(date: string): string[] | null {
  const parsed = new Date(`${date}T00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getDay();
  if (day === 0) return null;
  const endHour = day === 6 ? 13 : 17;
  return Array.from({ length: endHour - 8 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type Props = {
  value: string;
  // Emits the local "YYYY-MM-DDTHH:MM" value whenever the picker changes.
  onChange: (value: string) => void;
  required?: boolean;
  // Date-only mode: hides the time row and emits "YYYY-MM-DD" instead of a
  // full datetime. Used where the underlying data has no time component.
  dateOnly?: boolean;
  // Blocks past dates and (for today) already-passed times.
  disablePast?: boolean;
  // Times (HH:MM) that are already taken per "YYYY-MM-DD". Booked slots are
  // greyed out and cannot be confirmed.
  takenSlots?: Record<string, string[]>;
};

// A self-contained calendar + time picker used across the veterinary module.
// Clicking the field opens a centred popup card with a larger month-grid
// calendar and a styled time row, replacing the bare native date input.
export function DateTimePicker({ value, onChange, required, dateOnly, disablePast, takenSlots }: Props) {
  const [open, setOpen] = useState(false);
  const [slotError, setSlotError] = useState("");
  const initial = toDateInputParts(value);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(initial.date ? `${initial.date}T00:00` : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00`);
  });
  const [time, setTime] = useState(initial.time || todayInputParts().time);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedDate = initial.date;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const now = todayInputParts();

  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const cells = [...Array.from({ length: leadingBlanks }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const presets = officeHours(selectedDate || now.date);

  function dayDate(day: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isSelected(day: number): boolean {
    return selectedDate === dayDate(day);
  }

  function isSunday(day: number): boolean {
    return new Date(year, month, day).getDay() === 0;
  }

  function isToday(day: number): boolean {
    return now.date === dayDate(day);
  }

  function isPast(day: number): boolean {
    return disablePast === true && dayDate(day) < now.date;
  }

  function isSlotTaken(date: string, slotTime: string): boolean {
    return takenSlots?.[date]?.includes(slotTime) === true;
  }

  function isTimePassed(date: string, slotTime: string): boolean {
    return disablePast === true && date === now.date && slotTime < now.time;
  }

  function presetDisabled(date: string, slotTime: string): boolean {
    return isTimePassed(date, slotTime) || isSlotTaken(date, slotTime);
  }

  // Returns the first still-available preset when the desired time is blocked
  // (already passed today or already booked), so picked days never commit an
  // impossible slot.
  function validTimeFor(date: string, desired: string): string {
    if (!presetDisabled(date, desired)) return desired;
    const available = (officeHours(date) ?? []).find((preset) => !presetDisabled(date, preset));
    return available ?? desired;
  }

  function pickDay(day: number) {
    const date = dayDate(day);
    setSlotError("");
    if (dateOnly) {
      onChange(date);
      return;
    }
    const nextTime = validTimeFor(date, time);
    if (nextTime !== time) setTime(nextTime);
    onChange(`${date}T${nextTime}`);
  }

  function pickToday() {
    const date = new Date(`${now.date}T00:00`);
    while (date.getDay() === 0) date.setDate(date.getDate() + 1);
    const dateStr = dateKey(date);
    setSlotError("");
    onChange(dateOnly ? dateStr : `${dateStr}T${now.time}`);
    setTime(now.time);
    setCalendarMonth(new Date(`${dateStr}T00:00`));
  }

  function shiftMonth(offset: number) {
    setCalendarMonth(new Date(year, month + offset, 1));
  }

  function confirm() {
    setSlotError("");
    if (!selectedDate) {
      setOpen(false);
      return;
    }
    if (disablePast && selectedDate < now.date) {
      setSlotError("That date is in the past. Choose today or a later date.");
      return;
    }
    if (!dateOnly && isTimePassed(selectedDate, time)) {
      setSlotError("That time has already passed today. Pick a later time.");
      return;
    }
    if (!dateOnly && isSlotTaken(selectedDate, time)) {
      setSlotError("That slot is already booked. Choose another time.");
      return;
    }
    onChange(dateOnly ? selectedDate : `${selectedDate}T${time}`);
    setOpen(false);
  }

  function selectPreset(preset: string) {
    setSlotError("");
    setTime(preset);
  }

  return (
    <div className="vm-dtp" ref={rootRef}>
      <button type="button" className="vm-dtp-trigger" onClick={() => { setSlotError(""); setOpen(true); }}>
        <IconCalendar size={15} />
        <span className="vm-dtp-trigger-copy">
          <strong>{selectedDate ? fmtDate(`${selectedDate}T00:00`) : "Select a date"}</strong>
          <small>{selectedDate ? (dateOnly ? "tap to change" : `${time} · tap to change`) : required ? "Required" : "Optional"}</small>
        </span>
        {!dateOnly ? (
          <>
            <IconClock size={14} className="vm-dtp-clock" />
            <span className="vm-dtp-time">{time || "—:—"}</span>
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className="modal-backdrop vm-dtp-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="modal vm-dtp-modal" role="dialog" aria-label="Pick a date">
            <div className="modal-header vm-dtp-modal-head">
              <h2>{dateOnly ? "Pick a date" : "Pick a date and time"}</h2>
              <button type="button" className="ghost-button modal-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="vm-dtp-head">
              <button type="button" className="vm-dtp-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month"><IconArrowLeft size={14} /></button>
              <strong>{monthLabel}</strong>
              <button type="button" className="vm-dtp-nav" onClick={() => shiftMonth(1)} aria-label="Next month"><IconArrowRight size={14} /></button>
            </div>

            <div className="vm-dtp-week">
              {WEEKDAYS.map((weekDay) => <span key={weekDay}>{weekDay}</span>)}
            </div>
            <div className="vm-dtp-grid">
              {cells.map((day, index) =>
                day === null ? (
                  <span key={`b${index}`} className="vm-dtp-blank" />
                ) : (
                  <button
                    key={day}
                    type="button"
                    disabled={isSunday(day) || isPast(day)}
                    className={`vm-dtp-day${isSelected(day) ? " selected" : ""}${isToday(day) ? " today" : ""}${isSunday(day) || isPast(day) ? " closed" : ""}`}
                    onClick={() => pickDay(day)}
                  >
                    {day}
                  </button>
                ),
              )}
            </div>

            {!dateOnly ? (
              <div className="vm-dtp-time-row">
                <label>
                  <span>Time</span>
                  <input
                    className="vm-input"
                    type="time"
                    value={time}
                    min={disablePast && selectedDate === now.date ? now.time : undefined}
                    onChange={(event) => setTime(event.target.value || "00:00")}
                  />
                </label>
                {presets ? (
                  <span className="vm-dtp-presets">
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={presetDisabled(selectedDate || now.date, preset)}
                        className={`vm-dtp-preset${time === preset ? " active" : ""}`}
                        onClick={() => selectPreset(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className="vm-dtp-closed">
                    <IconClock size={13} /> Closed on Sundays
                  </span>
                )}
              </div>
            ) : null}

            {slotError ? <p className="vm-dtp-error">{slotError}</p> : null}

            <div className="vm-dtp-actions">
              <button type="button" className="ghost-button compact-action" onClick={pickToday}>Today</button>
              <button type="button" className="teal-button" onClick={confirm}>
                <IconCheck size={13} /> Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}