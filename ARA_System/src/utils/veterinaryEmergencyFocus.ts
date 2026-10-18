const focusKey = "ara:focus-veterinary-emergency";
export const emergencyQueueFocusEvent = "ara:focus-veterinary-emergency";
let queued = false;

export function openVeterinaryEmergencyQueue(navigate: (view: "veterinary-dashboard") => void) {
  queued = true;
  try { sessionStorage.setItem(focusKey, "1"); } catch { /* Same-page event still works without storage. */ }
  navigate("veterinary-dashboard");
  window.dispatchEvent(new Event(emergencyQueueFocusEvent));
}

export function focusPendingVeterinaryEmergency(force = false) {
  let pending = force || queued;
  try { const target = sessionStorage.getItem(focusKey); pending ||= Boolean(target); } catch { /* Optional storage. */ }
  if (!pending) return;
  const target = document.getElementById("veterinary-medical-queue") ?? document.querySelector<HTMLElement>(".vm-main .vm-card");
  if (!target) return;
  queued = false;
  try { sessionStorage.removeItem(focusKey); } catch { /* Optional storage. */ }
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: "auto", block: "start" });
}
