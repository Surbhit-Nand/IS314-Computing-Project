import { useUser } from "@clerk/react";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { submitDonation, type PaymentMethod } from "../../services/donationsApi";
import donationQrPlaceholder from "../../assets/donation-qr-placeholder.svg";

type DonateModalProps = {
  open: boolean;
  onClose: () => void;
};

// Preset amounts shown as quick-pick chips. Values are in whole dollars;
// the component converts to cents before posting so the backend never has
// to parse floats.
const PRESET_AMOUNTS = [10, 25, 50, 100] as const;

// Inline icons for the payment-method toggle. Kept local (rather than in
// public/icons.svg) so the two options stay paired and can't drift apart.
function CardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M2.5 9.5h19" />
      <path d="M6 15h4.5" />
    </svg>
  );
}

// Stylized QR mark: three finder rings plus a scattering of data modules.
function QrIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M3 3v6h6V3H3zm2 2v2h2V5H5zM15 3v6h6V3h-6zm2 2v2h2V5h-2zM3 15v6h6v-6H3zm2 2v2h2v-2H5z"
      />
      <path d="M10 3h2v2h-2zM13 6h2v2h-2zM12 9h2v2h-2zM10 12h2v2h-2zM13 12h2v2h-2zM16 12h2v2h-2zM10 15h2v2h-2zM13 15h2v2h-2zM16 15h2v2h-2zM10 18h2v2h-2zM13 18h2v2h-2zM16 18h2v2h-2z" />
    </svg>
  );
}

// Shared amount picker shown inside each payment-method panel. The selection
// lives in DonateModal state, so both panels always reflect the same value.
function AmountPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset className="donate-amounts">
      <legend>Choose an amount</legend>
      <div className="donate-presets">
        {PRESET_AMOUNTS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={value === String(preset) ? "chip active" : "chip"}
            onClick={() => onChange(String(preset))}
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
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </label>
    </fieldset>
  );
}

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Resets the form and closes. State is wiped on close (not on open) so
  // every reopen starts fresh without a reset-on-open effect.
  const closeModal = useCallback(() => {
    setAmountDollars("25");
    setDonorName("");
    setDonorEmail("");
    setMessage("");
    setPaymentMethod("card");
    setState({ kind: "idle" });
    onClose();
  }, [onClose]);

  // Close on Escape, matching the rest of the app's modal UX.
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, closeModal]);

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
        paymentMethod,
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
        if (event.target === event.currentTarget) closeModal();
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
            onClick={closeModal}
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
            <button type="button" className="teal-button" onClick={closeModal}>
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

            <fieldset className="donate-methods">
              <legend>Payment method</legend>
              <div className="donate-method-toggle">
                <button
                  type="button"
                  className={
                    paymentMethod === "card"
                      ? "method-button active"
                      : "method-button"
                  }
                  aria-pressed={paymentMethod === "card"}
                  onClick={() => setPaymentMethod("card")}
                >
                  <CardIcon />
                  <span>Card</span>
                </button>
                <button
                  type="button"
                  className={
                    paymentMethod === "qr" ? "method-button active" : "method-button"
                  }
                  aria-pressed={paymentMethod === "qr"}
                  onClick={() => setPaymentMethod("qr")}
                >
                  <QrIcon />
                  <span>QR</span>
                </button>
              </div>

              {/* Sliding pane: the whole payment area (amount + method) is
                  in the track. Selecting QR swipes it left by one panel;
                  the inactive panel stays out of tab order via inert. */}
              <div className="donate-panel-viewport">
                <div
                  className={
                    paymentMethod === "qr"
                      ? "donate-panel-track qr"
                      : "donate-panel-track"
                  }
                >
                  <div
                    className="donate-panel"
                    aria-hidden={paymentMethod === "qr"}
                    inert={paymentMethod === "qr"}
                  >
                    <AmountPicker value={amountDollars} onChange={setAmountDollars} />
                    <p>
                      Pay online using your credit or debit card. Your gift is
                      recorded immediately and a receipt is kept in our audit
                      log.
                    </p>
                  </div>
                  <div
                    className="donate-panel"
                    aria-hidden={paymentMethod === "card"}
                    inert={paymentMethod === "card"}
                  >
                    <AmountPicker value={amountDollars} onChange={setAmountDollars} />
                    <div className="qr-row">
                      <img
                        className="qr-art"
                        src={donationQrPlaceholder}
                        alt="SPCA Fiji payment QR code"
                        width={120}
                        height={120}
                      />
                      <p>
                        Scan this code with any banking or mobile-money app,
                        pay the amount above, then press Donate. Our team
                        verifies mobile transfers manually.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
                onClick={closeModal}
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
                  : `Donate via ${
                      paymentMethod === "qr" ? "QR" : "Card"
                    } $${isValidAmount ? dollars.toFixed(0) : "0"}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
