/** The same definition is used by account summaries and animal records. */
export function isUpcomingAppointment(
  appointment: { status: string; appointmentDate: string },
  now = Date.now(),
): boolean {
  return appointment.status === "booked" && Date.parse(appointment.appointmentDate) > now;
}

export const accountDataChanged = "ara:account-data-changed";

export function notifyAccountDataChanged() {
  window.dispatchEvent(new Event(accountDataChanged));
  try { localStorage.setItem(accountDataChanged, `${Date.now()}-${Math.random()}`); } catch { /* Storage is optional. */ }
}
