import { IconCheck, IconNotes } from "../../../components/MedicalIcons";
import { useState } from "react";
import type { MedicalQueueAnimal, VeterinaryEmergencyAction, VeterinaryEmergencyResponse } from "../../../types/veterinary";
import { coordinateVeterinaryEmergency } from "../../../services/veterinaryApi";

type Props = {
  medicalActionLabel: string;
  onBeginCare: () => void;
  animal: MedicalQueueAnimal;
  response: VeterinaryEmergencyResponse | undefined;
  currentVetId?: string;
  unavailable: boolean;
  getToken: () => Promise<string | null>;
  onChanged: () => Promise<void>;
};
type Mutation = { action: "attend" | "release" }
  | { action: "take_over"; note: string; handoffConfirmed: true }
  | { action: "support"; note: string; supportRequired: boolean };

export function EmergencyResponseActions({ animal, response, currentVetId, unavailable, getToken, onChanged, medicalActionLabel, onBeginCare }: Props) {
  const [receipt, setReceipt] = useState<VeterinaryEmergencyResponse["assistanceAlert"]>();
  const [form, setForm] = useState<"begin" | "support" | "take_over" | null>(null);
  const [note, setNote] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [support, setSupport] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [formExpectation, setFormExpectation] = useState<Pick<VeterinaryEmergencyAction, "responseId" | "version"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owner = response?.attendingVeterinarianClerkUserId;
  const isOwner = Boolean(currentVetId && owner === currentVetId);
  const delivery = receipt ?? response?.assistanceAlert;

  function openForm(kind: "begin" | "support" | "take_over") {
    // Keep the exact state the vet reviewed. Background polling must not turn
    // an agreed handoff into acceptance of a different owner's newer state.
    setFormExpectation({ responseId: response?.id ?? null, version: response?.version ?? null });
    setMenuOpen(false);
    setForm(kind);
    setNote(kind === "support" ? response?.coordinationNote ?? "" : "");
    setSupport(response?.supportRequired ?? false);
    setConfirmed(false);
    setError("");
  }

  async function act(action: Mutation) {
    if (busy || unavailable || !currentVetId) return false;
    let succeeded = false;
    setBusy(true); setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again before updating the emergency response.");
      const saved = await coordinateVeterinaryEmergency(token, animal.id, {
        ...action,
        ...((action.action === "take_over" || action.action === "support" || action.action === "attend") && formExpectation ? formExpectation : {
          responseId: response?.id ?? null,
          version: response?.version ?? null,
        }),
      });
      succeeded = true;
      setReceipt(saved.assistanceAlert);
      setMenuOpen(false);
      setForm(null); setNote(""); setConfirmed(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Emergency response could not be updated.");
    } finally {
      // Refresh on conflicts as well as successes; never retry a handoff silently.
      try { await onChanged(); }
      catch { succeeded = false; setError("Could not refresh the response. Refresh the queue before trying again."); }
      finally { setBusy(false); }
    }
    return succeeded;
  }

  return <div className="vm-emergency-response" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
    <div className="vm-emergency-response-actions vm-response-toolbar">
      <div className="vm-response-medical-actions"><button type="button" className="vm-queue-action vm-medical-action" disabled={busy || unavailable || !currentVetId} onClick={() => {
        if (owner) onBeginCare();
        else openForm("begin");
      }}>{medicalActionLabel}</button></div>
      <div className="vm-response-utilities">
        {owner ? <button type="button" className="vm-response-icon" aria-label={`Care options for ${animal.name}`} title="Care options" aria-expanded={menuOpen} disabled={busy || unavailable || !currentVetId} onClick={() => setMenuOpen(!menuOpen)}>{"\u22ef"}</button> : null}
        {response?.coordinationNote || response?.supportRequired ? <button type="button" className={`vm-response-icon${response?.supportRequired ? " needs-support" : ""}`} aria-label={response?.supportRequired ? "Support required: view coordination notes" : "View coordination notes"} title={response?.supportRequired ? "Support required" : "Coordination notes"} aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}><IconNotes size={14} /></button> : null}
        {delivery ? <span className={`vm-response-delivery${delivery.status === "sent" ? " is-sent" : ""}`} tabIndex={0} role="img" aria-label={assistanceDeliveryText(delivery)} title={assistanceDeliveryText(delivery)}>{delivery.status === "sent" ? <IconCheck size={14} /> : <IconNotes size={14} />}</span> : null}
      </div>
    </div>
    {unavailable ? <small className="vm-hint">Response unavailable. Refresh before beginning care.</small> : null}
    {menuOpen && owner ? <div className="vm-response-context-menu" role="group" aria-label={`Coordination actions for ${animal.name}`}>
      {isOwner ? <><button type="button" className="vm-queue-action" disabled={busy} onClick={() => void act({ action: "release" })}>Release</button>
        <button type="button" className="vm-queue-action" disabled={busy} onClick={() => openForm("support")}>Request Support</button></>
        : <button type="button" className="vm-queue-action" disabled={busy} onClick={() => openForm("take_over")}>Take over</button>}
    </div> : null}
    {form === "begin" ? <form className="vm-emergency-response-form" aria-label={`Begin care for ${animal.name}`} onSubmit={(event) => {
      event.preventDefault();
      void (async () => { if (await act({ action: "attend" })) onBeginCare(); })();
    }}>
      <p>Begin care for {animal.name}? Confirm to record you as the attending veterinarian and open the medical workflow. Existing emergency assistance notifications will be sent when needed.</p>
      <div className="vm-emergency-response-actions"><button type="submit" className="vm-queue-action is-primary" disabled={busy}>{busy ? "Starting..." : "Confirm begin care"}</button>
        <button type="button" className="vm-queue-action" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {notesOpen && (response?.coordinationNote || response?.supportRequired) ? <div className="vm-response-note-content" role="region" aria-label={`Coordination notes for ${animal.name}`}>
      {response?.supportRequired ? <p>Support required</p> : null}{response?.coordinationNote ? <p className="vm-emergency-note">{response.coordinationNote}</p> : null}
    </div> : null}
    {form && form !== "begin" ? <form className="vm-emergency-response-form" onSubmit={(event) => {
      event.preventDefault();
      void act(form === "take_over" ? { action: "take_over", note, handoffConfirmed: true } : { action: "support", note, supportRequired: support });
    }}>
      <label>{form === "take_over" ? "Handoff note" : "Support / coordination note"}
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} required={form === "take_over" || support} disabled={busy} rows={3} />
      </label>
      <label className="vm-emergency-confirm"><input type="checkbox" checked={form === "take_over" ? confirmed : support} disabled={busy} onChange={(event) => form === "take_over" ? setConfirmed(event.target.checked) : setSupport(event.target.checked)} />
        {form === "take_over" ? "I confirm the agreed handoff and accept responsibility." : "Additional assistance required"}
      </label>
      <div className="vm-emergency-response-actions"><button type="submit" className="vm-queue-action" disabled={busy || (form === "take_over" && (!confirmed || !note.trim())) || (form === "support" && support && !note.trim())}>{busy ? "Saving…" : form === "take_over" ? "Confirm takeover" : "Save support"}</button>
        <button type="button" className="vm-queue-action" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}

function assistanceDeliveryText(receipt: VeterinaryEmergencyResponse["assistanceAlert"]) {
  if (!receipt) return "";
  if (receipt.status === "sent") return `Assistance alert sent to ${receipt.recipientCount} other veterinarian(s) at confirmation. Delivery does not confirm help is coming.`;
  if (receipt.status === "no_other_vets") return "No other authorized veterinarians available to notify. Coordinate assistance or emergency referral directly.";
  if (receipt.status === "unavailable") return "Assistance alert was not sent: veterinary directory unavailable. Coordinate assistance directly.";
  return "No remaining unassigned Critical cases when attendance was confirmed.";
}
