import { useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import { IconCalendar, IconCalendarPlus, IconCheck, IconClock, IconPawPrint, IconUser } from "../../components/MedicalIcons";
import { bookVeterinaryAppointment, fetchAppointmentAnimals, fetchVeterinaryAppointments } from "../../services/veterinaryApi";
import type { MedicalQueueAnimal, VeterinaryAppointment } from "../../types/veterinary";
import type { VeterinaryView } from "./vetTypes";
import { VeterinaryNavbar } from "./components/VeterinaryNavbar";
import { AnimalThumb, Badge, Card, EmptyState, Field } from "./components/VetUi";
import { DateTimePicker } from "./components/DateTimePicker";
import { label } from "./components/vetHelpers";

type Props = { currentView: VeterinaryView; onNavigate: (view: VeterinaryView) => void };

const purposes = ["Follow-up examination", "Vaccination review", "Post-treatment review", "Other veterinary care"];

export function VeterinaryAppointmentBooking({ currentView, onNavigate }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [animals, setAnimals] = useState<MedicalQueueAnimal[]>([]);
  const [appointments, setAppointments] = useState<VeterinaryAppointment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [slot, setSlot] = useState("");

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const [animalList, appointmentList] = await Promise.all([fetchAppointmentAnimals(token), fetchVeterinaryAppointments(token)]);
        setAnimals(animalList);
        setAppointments(appointmentList);
      } catch (value) {
        setError(value instanceof Error ? value.message : "Could not load bookings");
      }
    })();
  }, [getToken]);

  // Times already booked per local "YYYY-MM-DD", so the picker can grey them out.
  const takenSlots = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const entry of appointments) {
      if (entry.appointment.status !== "booked") continue;
      const date = new Date(entry.appointment.appointmentDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      (map[key] ??= []).push(time);
    }
    return map;
  }, [appointments]);

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">Veterinary care</p>
          <h1>Sign in to book an appointment</h1>
          <p>Follow-up veterinary appointments require an authenticated account.</p>
        </div>
      </main>
    );
  }

  const bookableAnimals = animals;
  const selectedAnimal = bookableAnimals.find((animal) => animal.id === selectedId) ?? null;

  return (
    <main className="vm-page">
      <VeterinaryNavbar currentView={currentView} onNavigate={onNavigate} />
      <div className="vm-container">
        <header className="vm-page-head">
          <div>
            <p className="vm-eyebrow">Book care</p>
            <h1>Follow-up appointment</h1>
            <p className="vm-subtitle">Choose an animal and a time that works. The visit is saved to the animal&apos;s medical history.</p>
          </div>
        </header>

        {error ? <p className="form-error">{error}</p> : null}
        {message ? (
          <p className="vm-lock-hint" style={{ background: "var(--vm-green-tint)", borderColor: "rgba(31,157,85,0.3)", color: "var(--vm-green)" }}>
            <IconCheck size={15} /> {message}
          </p>
        ) : null}

        <div className="vm-layout">
          <div className="vm-main">
            <form
              className="vm-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                void (async () => {
                  const token = await getToken();
                  if (!token) return;
                  if (!slot) {
                    setError("Choose the date and time for the visit to continue.");
                    return;
                  }
                  setSaving(true);
                  try {
                    await bookVeterinaryAppointment(token, {
                      animalId: data.get("animal"),
                      appointmentDate: new Date(slot).toISOString(),
                      purpose: data.get("purpose"),
                      notes: `Booked by ${user?.firstName ?? "account holder"}`,
                    });
                    setMessage("Appointment booked successfully.");
                    setError("");
                    setSelectedId("");
                    setSlot("");
                    form.reset();
                  } catch (value) {
                    setError(value instanceof Error ? value.message : "Booking failed");
                    setMessage("");
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            >
              <Card title="Appointment details" detail="Pick the animal, date, time and reason for the visit.">
                <div className="vm-fields">
                  <Field labelText="Animal" required full>
                    <select className="vm-select" name="animal" required value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                      <option value="">Select an animal</option>
                      {bookableAnimals.map((animal) => (
                        <option value={animal.id} key={animal.id}>{animal.publicId} · {animal.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field labelText="Visit date &amp; time" required>
                    <DateTimePicker value={slot} onChange={setSlot} required disablePast takenSlots={takenSlots} />
                  </Field>
                  <Field labelText="Purpose" required full>
                    <select className="vm-select" name="purpose" required>
                      {purposes.map((purpose) => (
                        <option value={purpose} key={purpose}>{purpose}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Card>

              <div className="vm-form-actions">
                <button type="button" className="ghost-button" onClick={() => onNavigate("vet-appointments")}>Cancel</button>
                <button type="submit" className="teal-button" disabled={saving}><IconCalendarPlus size={15} /> {saving ? "Booking…" : "Book appointment"}</button>
              </div>
            </form>

            <Card title="Animals available for follow-up" detail="Choose any registered animal for a follow-up visit.">
              {bookableAnimals.length === 0 ? (
                <EmptyState icon={<IconPawPrint size={20} />} title="No animals available" detail="There are no registered animals to book a follow-up visit for." />
              ) : (
                <div className="vm-list-stack">
                  {bookableAnimals.slice(0, 8).map((animal) => (
                    <button
                      type="button"
                      key={animal.id}
                      className={`vm-list-row vm-animal-pick${selectedId === animal.id ? " selected" : ""}`}
                      onClick={() => setSelectedId(animal.id)}
                    >
                      <span className="vm-animal-cell">
                        <AnimalThumb photoUrl={animal.photoUrls?.[0]} name={animal.name} />
                        <span className="vm-copy">
                          <strong>{animal.name}</strong>
                          <small>{animal.publicId} · {label(animal.type)}</small>
                        </span>
                      </span>
                      <Badge tone={animal.medicallyCleared ? "green" : "blue"}>{animal.medicallyCleared ? "Cleared" : "In care"}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <aside className="vm-side">
            <Card title="Booking summary" detail="What you are about to schedule.">
              {selectedAnimal ? (
                <div className="vm-summary-line">
                  <div className="vm-status-line">
                    <strong>{selectedAnimal.name}</strong>
                    <Badge tone="blue">{selectedAnimal.publicId}</Badge>
                  </div>
                  <p>{label(selectedAnimal.type)} · {selectedAnimal.breed ?? "Breed not recorded"}</p>
                  <div className="vm-facts">
                    <div className="vm-fact-row"><dt><IconCalendar size={12} /> Appointment</dt><dd>Follow-up visit</dd></div>
                    <div className="vm-fact-row"><dt><IconClock size={12} /> Added to</dt><dd>Medical history</dd></div>
                    <div className="vm-fact-row"><dt><IconUser size={12} /> Booked by</dt><dd>{user?.firstName ?? "Account holder"}</dd></div>
                  </div>
                </div>
              ) : (
                <EmptyState icon={<IconPawPrint size={18} />} title="No animal selected" detail="Select an animal to see the appointment summary." />
              )}
            </Card>
            <Card title="Good to know" detail="Follow-up visits keep care on track.">
              <ul className="vm-check-list">
                <li className="vm-check-row" style={{ gridTemplateColumns: "26px minmax(0,1fr)" }}>
                  <span className="vm-check ok"><IconCheck size={13} /></span>
                  <span className="vm-check-copy"><strong>Saved automatically</strong><small>Every visit is added to the animal&apos;s medical history.</small></span>
                </li>
                <li className="vm-check-row" style={{ gridTemplateColumns: "26px minmax(0,1fr)" }}>
                  <span className="vm-check ok"><IconCheck size={13} /></span>
                  <span className="vm-check-copy"><strong>Vet confirmed</strong><small>A veterinarian completes the visit notes.</small></span>
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}