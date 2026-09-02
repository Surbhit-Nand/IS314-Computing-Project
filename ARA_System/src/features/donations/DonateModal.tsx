import { useUser } from "@clerk/react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { submitDonation } from "../../services/donationsApi";

type DonateModalProps = {
  open: boolean;
  onClose: () => void;
};

// Preset amounts shown as quick-pick chips. Values are in whole dollars;
// the component converts to cents before posting so the backend never has
// to parse floats.
const PRESET_AMOUNTS = [10, 25, 50, 100] as const;

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; amountCents: number; currency: string }
  | { kind: "error"; message: string };

// Modal that opens when any "Donate" button on the site is clicked.
// Lets the donor pick a preset amount or enter a custom one, optionally
// leave a name/email/message, and POSTs to /api/donations. The backend
// records the donation and writes an audit log entry; on success the
// modal shows a confirmation state with a "Close" button.
export function DonateModal({ open, onClose }: DonateModalProps) {
  const { user, isSignedIn } = useUser();
  const headingId = useId();

  const [amountDollars, setAmountDollars] = useState<string>("25");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Reset the form whenever the modal is re-opened so a previous
  // submission's state doesn't bleed into the next open.
  useEffect(() => {
    if (open) {
      setAmountDollars("25");
      setDonorName("");
      setDonorEmail("");
      setMessage("");
      setState({ kind: "idle" });
    }
  }, [open]);

  // Close on Escape, matching the rest of the app's modal UX.
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const dollars = Number(amountDollars);
  const isValidAmount =
    Number.isFinite(dollars) && dollars >= 1 && dollars <= 10_000;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidAmount) {
      setState({
        kind: "error",
        message: "Enter an amount between $1 and $10,000.",
      });
      return;
    }

    setState({ kind: "submitting" });

    try {
      const result = await submitDonation({
        amountCents: Math.round(dollars * 100),
        // Pre-fill name/email from the signed-in Clerk user when
        // available, but only if the donor hasn't typed their own.
        donorName: (donorName.trim() || user?.firstName) ?? undefined,
        donorEmail:
          donorEmail.trim() ||
          user?.primaryEmailAddress?.emailAddress ||
          undefined,
        message: message.trim() || undefined,
      });
      setState({
        kind: "success",
        amountCents: result.amountCents,
        currency: result.currency,
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Donation could not be processed.",
      });
    }
  }

  const isSubmitting = state.kind === "submitting";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        // Click on the backdrop (not the dialog itself) closes.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal donate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Support SPCA Fiji</p>
            <h2 id={headingId}>Make a donation</h2>
          </div>
          <button
            type="button"
            className="ghost-button small"
            onClick={onClose}
            aria-label="Close donation dialog"
          >
            ✕
          </button>
        </header>

        {state.kind === "success" ? (
          <div className="donate-success">
            <p className="eyebrow">Thank you</p>
            <h3>
              Your donation of{" "}
              <strong>
                ${(state.amountCents / 100).toFixed(2)} {state.currency}
              </strong>{" "}
              is on its way to the animals.
            </h3>
            <p>
              A receipt has been recorded in our audit log. SPCA Fiji will put
              every dollar toward rescue, medical care, and rehoming.
            </p>
            <button type="button" className="teal-button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="donate-form" onSubmit={handleSubmit}>
            <p className="donate-intro">
              Your contribution funds rescue operations, veterinary care, and
              shelter supplies across Fiji.
              {isSignedIn
                ? " We&apos;ll attach this donation to your account automatically."
                : " Donations can be made anonymously or with your details for a receipt."}
            </p>

            <fieldset className="donate-amounts">
              <legend>Choose an amount</legend>
              <div className="donate-presets">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={
                      amountDollars === String(preset) ? "chip active" : "chip"
                    }
                    onClick={() => setAmountDollars(String(preset))}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
              <label className="donate-custom">
                <span>Or enter a custom amount (USD)</span>
                <input
                  type="number"
                  min={1}
                  max={10_000}
                  step={1}
                  value={amountDollars}
                  onChange={(event) => setAmountDollars(event.target.value)}
                  required
                />
              </label>
            </fieldset>

            <label className="donate-field">
              <span>Name (optional)</span>
              <input
                type="text"
                value={donorName}
                maxLength={120}
                onChange={(event) => setDonorName(event.target.value)}
                placeholder="Jane Doe"
              />
            </label>

            <label className="donate-field">
              <span>Email (optional)</span>
              <input
                type="email"
                value={donorEmail}
                maxLength={254}
                onChange={(event) => setDonorEmail(event.target.value)}
                placeholder="jane@example.com"
              />
            </label>

            <label className="donate-field">
              <span>Message (optional)</span>
              <textarea
                value={message}
                maxLength={500}
                rows={3}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="In memory of a beloved pet..."
              />
            </label>

            {state.kind === "error" && (
              <p className="dashboard-data-state error" role="alert">
                {state.message}
              </p>
            )}

            <div className="donate-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="teal-button"
                disabled={isSubmitting || !isValidAmount}
              >
                {isSubmitting
                  ? "Processing..."
                  : `Donate $${isValidAmount ? dollars.toFixed(0) : "0"}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
