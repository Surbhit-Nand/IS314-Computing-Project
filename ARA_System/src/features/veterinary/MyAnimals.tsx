import { SignInButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconPawPrint } from "../../components/MedicalIcons";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { SuccessToast } from "../../components/SuccessToast";
import companionPhoto from "../../assets/spca-hero.webp";
import "./my-animals-banner.css";
import "./my-animal-records.css";
import { DateTimePicker } from "./components/DateTimePicker";
import { accountDataChanged, isUpcomingAppointment, notifyAccountDataChanged } from "../../utils/appointments";
import {
  bookMyAnimalAppointment,
  cancelMyAnimalAppointment,
  fetchMyAnimalAvailability,
  fetchMyAnimalRecord,
  fetchMyAnimals,
  type AppointmentAvailability,
  type MyAnimalRecord,
  type OwnedAnimal,
  type OwnerAppointment,
} from "../../services/myAnimalsApi";

type PageView = "my-animals" | "my-animal-record" | "my-animal-booking";
type Props = {
  currentView: PageView;
  animalId: string | null;
  onNavigate: (view: SiteHeaderView) => void;
  onSelectAnimal: (animalId: string) => void;
};
type RecordTab = "overview" | "medical" | "appointments";

const reasons = ["Routine check-up", "Vaccination", "Illness or symptoms", "Injury", "Other"];
const clinicZone = "Pacific/Fiji";

function clinicToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinicZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function animalImage(animal: OwnedAnimal, className: string) {
  return animal.photoUrls[0] ? (
    <img className={className} src={animal.photoUrls[0]} alt={animal.name} />
  ) : (
    <div className={`${className} my-animals-photo-placeholder`} aria-label={`${animal.name} photo unavailable`}>
      <IconPawPrint size={32} />
    </div>
  );
}

function displayDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: clinicZone,
  });
}

function displayTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: clinicZone,
  });
}

function readable(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AppointmentCard({
  appointment,
  onCancel,
}: {
  appointment: OwnerAppointment;
  onCancel?: () => void;
}) {
  return (
    <article className="my-animal-appointment-card">
      <div className="my-animal-appointment-copy">
        <div className="my-animal-appointment-heading">
          <strong>{appointment.purpose}</strong>
          <span className={`my-animal-status ${appointment.status}`}>{readable(appointment.status)}</span>
        </div>
        <p>{displayDate(appointment.appointmentDate)} · {displayTime(appointment.appointmentDate)}</p>
        {appointment.notes && <small>{appointment.notes}</small>}
      </div>
      {onCancel && (
        <button type="button" className="ghost-button compact-action" onClick={onCancel}>
          Cancel appointment
        </button>
      )}
    </article>
  );
}

export function MyAnimals({ currentView, animalId, onNavigate, onSelectAnimal }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [animals, setAnimals] = useState<OwnedAnimal[]>([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState("");
  const [record, setRecord] = useState<MyAnimalRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [activeTab, setActiveTab] = useState<RecordTab>("overview");
  const [availability, setAvailability] = useState<AppointmentAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(clinicToday);
  const [selectedTime, setSelectedTime] = useState("");
  const [bookingStep, setBookingStep] = useState(1);
  const [reason, setReason] = useState(reasons[0]);
  const [otherReason, setOtherReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookedAppointment, setBookedAppointment] = useState<OwnerAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OwnerAppointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState("");
  const [animalAppointments, setAnimalAppointments] = useState<Record<string, OwnerAppointment[] | null>>({});
  const animalsRequest = useRef(0);
  const recordRequest = useRef(0);
  const availabilityRequest = useRef(0);

  const loadAnimals = useCallback(async (background = false) => {
    const version = ++animalsRequest.current;
    if (!background) setAnimalsLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setAnimalsError("Sign in to view your adopted animals.");
        return;
      }
      const owned = await fetchMyAnimals(token);
      const records = await Promise.allSettled(owned.map((animal) => fetchMyAnimalRecord(token, animal.id)));
      if (version !== animalsRequest.current) return;
      setAnimals(owned);
      setAnimalAppointments(Object.fromEntries(owned.map((animal, index) => {
        const result = records[index];
        return [animal.id, result.status === "fulfilled" ? result.value.appointments : null];
      })));
      setAnimalsError("");
    } catch (error) {
      if (version !== animalsRequest.current) return;
      setAnimalsError(error instanceof Error ? error.message : "Your adopted animals could not be loaded.");
    } finally {
      if (version === animalsRequest.current) setAnimalsLoading(false);
    }
  }, [getToken]);

  const loadRecord = useCallback(async (background = false) => {
    if (!animalId) return;
    const version = ++recordRequest.current;
    if (!background) setRecordLoading(true);
    setRecordError("");
    try {
      const token = await getToken();
      if (!token) {
        setRecordError("Sign in to view this animal's records.");
        return;
      }
      const next = await fetchMyAnimalRecord(token, animalId);
      if (version !== recordRequest.current) return;
      setRecord(next);
      setRecordError("");
    } catch (error) {
      if (version !== recordRequest.current) return;
      setRecord(null);
      setRecordError(error instanceof Error ? error.message : "Animal records could not be loaded.");
    } finally {
      if (version === recordRequest.current) setRecordLoading(false);
    }
  }, [animalId, getToken]);

  const loadAvailability = useCallback(async () => {
    if (!animalId || currentView !== "my-animal-booking" || !appointmentDate) return;
    const version = ++availabilityRequest.current;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    try {
      const token = await getToken();
      if (!token) {
        setAvailabilityError("Sign in to check appointment availability.");
        return;
      }
      const next = await fetchMyAnimalAvailability(token, animalId, appointmentDate);
      if (version !== availabilityRequest.current) return;
      setAvailability(next);
    } catch (error) {
      if (version !== availabilityRequest.current) return;
      setAvailability(null);
      setAvailabilityError(error instanceof Error ? error.message : "Available times could not be loaded.");
    } finally {
      if (version === availabilityRequest.current) setAvailabilityLoading(false);
    }
  }, [animalId, appointmentDate, currentView, getToken]);

  useEffect(() => () => {
    recordRequest.current += 1;
    availabilityRequest.current += 1;
  }, [animalId, currentView]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const timer = window.setTimeout(() => void loadAnimals(), 0);
    return () => window.clearTimeout(timer);
  }, [isLoaded, isSignedIn, loadAnimals]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || currentView !== "my-animals") return;
    const refresh = () => { void loadAnimals(true); };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener(accountDataChanged, refresh);
    const onStorage = (event: StorageEvent) => { if (event.key === accountDataChanged) refresh(); };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(accountDataChanged, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [currentView, isLoaded, isSignedIn, loadAnimals]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !animalId || currentView === "my-animals") return;
    const timer = window.setTimeout(() => void loadRecord(), 0);
    return () => window.clearTimeout(timer);
  }, [animalId, currentView, isLoaded, isSignedIn, loadRecord]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || currentView !== "my-animal-booking") return;
    const timer = window.setTimeout(() => void loadAvailability(), 0);
    return () => window.clearTimeout(timer);
  }, [currentView, isLoaded, isSignedIn, loadAvailability]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !animalId || currentView === "my-animals") return;
    const refresh = () => {
      void loadRecord(true);
      if (currentView === "my-animal-booking") void loadAvailability();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener(accountDataChanged, refresh);
    const onStorage = (event: StorageEvent) => { if (event.key === accountDataChanged) refresh(); };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(accountDataChanged, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [animalId, currentView, isLoaded, isSignedIn, loadAvailability, loadRecord]);

  const upcomingAppointments = useMemo(
    () => (record?.appointments ?? []).filter(
      (appointment) => isUpcomingAppointment(appointment),
    ).sort((a, b) => Date.parse(a.appointmentDate) - Date.parse(b.appointmentDate)),
    [record],
  );
  const pastAppointments = useMemo(
    () => (record?.appointments ?? []).filter((appointment) => !upcomingAppointments.includes(appointment)),
    [record, upcomingAppointments],
  );
  const medicalEntries = useMemo(() => {
    if (!record) return [];
    return [
      ...record.examinations.map((value) => ({ kind: "examination" as const, date: value.examinationDate, value })),
      ...record.treatments.map((value) => ({ kind: "treatment" as const, date: value.treatmentDate, value })),
      ...record.carePlan.map((value) => ({
        kind: "care" as const,
        date: value.completedDate ?? value.scheduledDate ?? value.createdAt,
        value,
      })),
    ].sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
  }, [record]);

  async function cancelAppointment() {
    if (!animalId || !cancelTarget) return;
    setCancelling(true);
    try {
      const token = await getToken();
      if (!token) {
        setRecordError("Sign in to cancel this appointment.");
        return;
      }
      await cancelMyAnimalAppointment(token, animalId, cancelTarget.id);
      notifyAccountDataChanged();
      setRecord((previous) => previous
        ? {
            ...previous,
            appointments: previous.appointments.map((appointment) =>
              appointment.id === cancelTarget.id ? { ...appointment, status: "cancelled" } : appointment,
            ),
          }
        : previous);
      setToast("Appointment cancelled. The time is available again.");
      setCancelTarget(null);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "The appointment could not be cancelled.");
    } finally {
      setCancelling(false);
    }
  }

  async function confirmBooking() {
    if (!animalId || !record || !selectedTime) return;
    setSaving(true);
    setBookingError("");
    const purpose = reason === "Other" ? otherReason.trim() : reason;
    try {
      const token = await getToken();
      if (!token) {
        setBookingError("Sign in to book an appointment.");
        return;
      }
      const appointment = await bookMyAnimalAppointment(token, animalId, {
        date: appointmentDate,
        time: selectedTime,
        reason: purpose,
        notes: notes.trim() || undefined,
      });
      setBookedAppointment(appointment);
      setRecord((previous) => previous ? { ...previous, appointments: [...previous.appointments, appointment] } : previous);
      notifyAccountDataChanged();
      setBookingStep(4);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "The appointment could not be booked.");
      if (error instanceof Error && error.message.includes("just been booked")) {
        setBookingStep(2);
        setSelectedTime("");
        void loadAvailability();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded || (isSignedIn && currentView !== "my-animals" && animalId && recordLoading)) {
    return (
      <main className="dashboard-locked loading-screen">
        <div className="dashboard-locked-card"><div className="loading-spinner" aria-hidden="true" /><p>Loading your animals…</p></div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">Your SPCA family</p>
          <h1>Sign in to view My Animals</h1>
          <p>Adopted animals and their veterinary records are available to their registered adopter.</p>
          <SignInButton mode="modal"><button type="button" className="teal-button">Log in</button></SignInButton>
        </div>
      </main>
    );
  }

  const pageTitle = currentView === "my-animals" ? "My Animals" : record?.animal.name ?? "Animal records";

  return (
    <div className="my-animals-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentView}
        onNavigate={onNavigate}
      />
      <main className={`page-shell my-animals-shell${currentView === "my-animals" ? "" : " my-animals-shell-detail"}`}>
        {currentView === "my-animals" && (
          <header className="my-animals-intro my-animals-banner">
            <div className="my-animals-banner-copy">
              <p className="my-animals-banner-eyebrow"><IconPawPrint size={18} /> Your SPCA family{!animalsLoading && !animalsError ? ` · ${animals.length} adopted` : ""}</p>
              <h1>{pageTitle}</h1>
              <p className="my-animals-banner-message">A little love. A lifetime of companionship.</p>
              <p className="my-animals-banner-description">Keep their records close and their next care visit a little easier. Everything for your adopted companions, in one place.</p>
              <span className="my-animals-banner-note">Together, beyond adoption</span>
            </div>
            <div className="my-animals-banner-photo" aria-hidden="true">
              <img src={companionPhoto} alt="" fetchPriority="high" />
              <span className="my-animals-banner-caption"><IconPawPrint size={18} /> A forever home starts with you.</span>
            </div>
          </header>
        )}

        {currentView === "my-animals" ? (
          <>
            {animalsError && <p className="form-error" role="alert">{animalsError}</p>}
            {animalsLoading ? (
              <p className="my-animals-loading">Loading your adopted animals…</p>
            ) : animals.length === 0 ? (
              <section className="my-animals-empty">
                <span><IconPawPrint size={28} /></span>
                <h2>You don&apos;t have any adopted animals yet.</h2>
                <p>When an adoption is complete, your animal and their records will appear here.</p>
                <button type="button" className="teal-button" onClick={() => onNavigate("animal-listings")}>Browse Animals</button>
              </section>
            ) : (
              <section className="my-animals-list" aria-label="Your adopted animals">
                {animals.map((animal) => (
                  <article className="my-animal-row" key={animal.id}>
                    {animalImage(animal, "my-animal-row-photo")}
                    <div className="my-animal-row-copy">
                      <h2>{animal.name}</h2>
                      <p className="my-animal-row-meta">{readable(animal.type)}{animal.breed ? ` · ${animal.breed}` : ""}</p>
                      <p className="my-animal-row-facts">
                        <span>{readable(animal.gender)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{animal.estimatedAge || "Age not recorded"}</span>
                      </p>
                      <p className="my-animal-row-next">
                        {animalAppointments[animal.id] == null ? "Appointment information unavailable" : (() => {
                          const next = animalAppointments[animal.id]!.filter((appointment) => isUpcomingAppointment(appointment)).sort((a, b) => Date.parse(a.appointmentDate) - Date.parse(b.appointmentDate))[0];
                          return next ? `Next visit · ${displayDate(next.appointmentDate)} at ${displayTime(next.appointmentDate)}` : "No upcoming appointments";
                        })()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="teal-button my-animal-row-action"
                      onClick={() => {
                        setActiveTab("overview");
                        onSelectAnimal(animal.id);
                        onNavigate("my-animal-record");
                      }}
                      aria-label={`View ${animal.name}'s records`}
                    >
                      View Records
                    </button>
                  </article>
                ))}
              </section>
            )}
          </>
        ) : recordLoading ? (
          <p className="my-animals-loading">Loading {record?.animal.name ?? "animal"}&apos;s records…</p>
        ) : recordError ? (
          <section className="my-animals-empty" role="alert">
            <span><IconPawPrint size={28} /></span>
            <h2>We couldn&apos;t load this animal&apos;s records.</h2>
            <p>{recordError}</p>
            <button type="button" className="ghost-button" onClick={() => onNavigate("my-animals")}>Back to My Animals</button>
          </section>
        ) : record ? (
          currentView === "my-animal-booking" ? (
            <section className="my-animal-booking">
              <button type="button" className="my-animal-back" onClick={() => onNavigate("my-animal-record")}>← Back to {record.animal.name}&apos;s records</button>
              {recordError && <p className="form-error" role="alert">{recordError}</p>}
              <div className="my-animal-booking-layout companion-booking-layout">
                <aside className="my-animal-booking-profile">
                  {animalImage(record.animal, "my-animal-booking-photo")}
                  <p className="eyebrow">Appointment for</p>
                  <h2>{record.animal.name}</h2>
                  <p>{readable(record.animal.type)}{record.animal.breed ? ` · ${record.animal.breed}` : ""}</p>
                  {!bookedAppointment && <dl className="companion-booking-summary">
                    <div><dt>Visit date</dt><dd>{displayDate(appointmentDate)}</dd></div>
                    <div><dt>Time · Fiji</dt><dd>{selectedTime || "Choose a time"}</dd></div>
                    {bookingStep >= 3 && <div><dt>Reason</dt><dd>{reason === "Other" ? otherReason || "Tell us more" : reason}</dd></div>}
                  </dl>}
                </aside>
                <div className="my-animal-booking-main">
                  {bookedAppointment ? (
                    <div className="my-animal-booking-success" role="status">
                      <span className="my-animal-success-mark">✓</span>
                      <p className="eyebrow">Veterinary care</p>
                      <h2>Appointment booked successfully</h2>
                      <dl>
                        <div><dt>Animal</dt><dd>{record.animal.name}</dd></div>
                        <div><dt>Date</dt><dd>{displayDate(bookedAppointment.appointmentDate)}</dd></div>
                        <div><dt>Time</dt><dd>{displayTime(bookedAppointment.appointmentDate)}</dd></div>
                        <div><dt>Reason</dt><dd>{bookedAppointment.purpose}</dd></div>
                      </dl>
                      <div className="my-animal-action-row">
                        <button type="button" className="teal-button" onClick={() => {
                          setBookedAppointment(null);
                          setActiveTab("appointments");
                          onNavigate("my-animal-record");
                          void loadRecord();
                        }}>View Appointments</button>
                        <button type="button" className="ghost-button" onClick={() => onNavigate("my-animals")}>Return to My Animals</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="eyebrow">Book veterinary care</p>
                      <h1>Book a visit for {record.animal.name}</h1>
                      <ol className="my-animal-booking-steps" aria-label="Booking steps">
                        {["Date", "Time", "Details", "Review"].map((label, index) => (
                          <li aria-current={bookingStep === index + 1 ? "step" : undefined} className={bookingStep === index + 1 ? "active" : bookingStep > index + 1 ? "complete" : ""} key={label}>
                            <button type="button" disabled={index + 1 > bookingStep} onClick={() => setBookingStep(index + 1)} aria-label={`${label}${index + 1 === bookingStep ? ", current step" : ""}`}>
                              <span>{bookingStep > index + 1 ? "✓" : index + 1}</span>
                              <div>{label}<small>{["Pick a day", "Find a slot", "Tell us more", "Confirm visit"][index]}</small></div>
                            </button>
                          </li>
                        ))}
                      </ol>
                      {bookingError && <p className="form-error" role="alert">{bookingError}</p>}
                      {bookingStep === 1 && (
                        <section className="my-animal-booking-step">
                          <h2>Choose a date</h2>
                          <div className="my-animal-field">
                            <span>Appointment date</span>
                            <DateTimePicker
                              dateOnly
                              disablePast
                              minDate={clinicToday()}
                              required
                              value={appointmentDate}
                              onChange={(date) => {
                                availabilityRequest.current += 1;
                                setAppointmentDate(date);
                                setSelectedTime("");
                                setAvailability(null);
                                setAvailabilityError("");
                              }}
                            />
                          </div>
                          <p className="my-animal-hint">The clinic is open Monday–Friday 8:00 am–5:00 pm and Saturday 8:00 am–1:00 pm Fiji time.</p>
                          {availabilityError && <p className="form-error" role="alert">{availabilityError}</p>}
                          {availability && !availabilityLoading && !availability.slots.some((slot) => slot.available) && (
                            <p className="my-animal-hint" role="status">No appointment times are available for this date. Please choose another date.</p>
                          )}
                          <button type="button" className="teal-button" disabled={!availability?.slots.some((slot) => slot.available) || availabilityLoading} onClick={() => setBookingStep(2)}>
                            {availabilityLoading ? "Checking dates…" : "Continue to times"}
                          </button>
                        </section>
                      )}
                      {bookingStep === 2 && (
                        <section className="my-animal-booking-step">
                          <h2>Available times</h2>
                          {availabilityLoading ? <p className="my-animal-hint">Checking the clinic schedule…</p> : null}
                          {availability?.slots.length === 0 && <p className="my-animal-hint">The clinic is closed on Sundays. Choose another date.</p>}
                          <div className="my-animal-slots">
                            {(availability?.slots ?? []).map((slot) => (
                              <button
                                type="button"
                                key={slot.time}
                                disabled={!slot.available}
                                aria-pressed={selectedTime === slot.time}
                                className={`my-animal-slot${selectedTime === slot.time ? " selected" : ""}${slot.status !== "available" ? " unavailable" : ""}`}
                                onClick={() => setSelectedTime(slot.time)}
                              >
                                <strong>{new Date(`2000-01-01T${slot.time}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong>
                                <small>{slot.status === "booked" ? "Booked" : slot.status === "past" ? "Unavailable" : "Available"}</small>
                              </button>
                            ))}
                          </div>
                          <div className="my-animal-action-row">
                            <button type="button" className="ghost-button" onClick={() => setBookingStep(1)}>Back</button>
                            <button type="button" className="teal-button" disabled={availabilityLoading || !availability?.slots.some((slot) => slot.time === selectedTime && slot.available)} onClick={() => setBookingStep(3)}>Continue</button>
                          </div>
                        </section>
                      )}
                      {bookingStep === 3 && (
                        <section className="my-animal-booking-step">
                          <h2>What does {record.animal.name} need?</h2>
                          <label className="my-animal-field">
                            Appointment reason
                            <select value={reason} onChange={(event) => setReason(event.target.value)}>
                              {reasons.map((option) => <option key={option}>{option}</option>)}
                            </select>
                          </label>
                          {reason === "Other" && (
                            <label className="my-animal-field">
                              Reason
                              <input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} maxLength={160} required />
                            </label>
                          )}
                          <label className="my-animal-field">
                            Notes or symptoms <span>(optional)</span>
                            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={2000} placeholder="Tell the veterinary team anything that may help prepare for the visit." />
                          </label>
                          <div className="my-animal-action-row">
                            <button type="button" className="ghost-button" onClick={() => setBookingStep(2)}>Back</button>
                            <button type="button" className="teal-button" disabled={reason === "Other" && !otherReason.trim()} onClick={() => setBookingStep(4)}>Review appointment</button>
                          </div>
                        </section>
                      )}
                      {bookingStep === 4 && (
                        <section className="my-animal-booking-step">
                          <h2>Review and confirm</h2>
                          <dl className="my-animal-review">
                            <div><dt>Animal</dt><dd>{record.animal.name}</dd></div>
                            <div><dt>Date</dt><dd>{displayDate(appointmentDate)}</dd></div>
                            <div><dt>Time</dt><dd>{selectedTime ? new Date(`2000-01-01T${selectedTime}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}</dd></div>
                            <div><dt>Reason</dt><dd>{reason === "Other" ? otherReason : reason}</dd></div>
                            {notes.trim() && <div><dt>Notes</dt><dd>{notes}</dd></div>}
                          </dl>
                          <div className="my-animal-action-row">
                            <button type="button" className="ghost-button" onClick={() => setBookingStep(3)}>Back</button>
                            <button type="button" className="teal-button" disabled={saving} onClick={() => void confirmBooking()}>
                              {saving ? "Booking…" : "Confirm booking"}
                            </button>
                          </div>
                        </section>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="my-animal-record">
              <button type="button" className="my-animal-back" onClick={() => onNavigate("my-animals")}>← Back to My Animals</button>
              {recordError && <p className="form-error" role="alert">{recordError}</p>}
              <div className="companion-record-layout">
              <header className="my-animal-profile">
                {animalImage(record.animal, "my-animal-profile-photo")}
                <div className="my-animal-profile-copy">
                  <p className="eyebrow">Your companion · {record.animal.publicId}</p>
                  <h1>{record.animal.name}</h1>
                  <p>
                    {readable(record.animal.type)}
                    {record.animal.breed ? ` · ${record.animal.breed}` : ""}
                    {" · "}{readable(record.animal.gender)}
                    {" · "}{record.animal.estimatedAge || "Age not recorded"}
                  </p>
                </div>
                <button
                  type="button"
                  className="teal-button my-animal-profile-action"
                  onClick={() => {
                    setBookingStep(1);
                    setSelectedTime("");
                    setBookedAppointment(null);
                    setAppointmentDate(clinicToday());
                    onNavigate("my-animal-booking");
                  }}
                >
                    Book an appointment
                </button>
                <div className="companion-next-visit">
                  <span>Next visit</span>
                  <strong>{upcomingAppointments[0] ? displayDate(upcomingAppointments[0].appointmentDate) : "Nothing scheduled"}</strong>
                  <p>{upcomingAppointments[0] ? `${displayTime(upcomingAppointments[0].appointmentDate)} · Fiji time` : "Book a visit when your companion needs care."}</p>
                  <button type="button" className="text-button" onClick={() => setActiveTab("appointments")}>Appointment history →</button>
                </div>
              </header>
              <div className="companion-record-content">
              <nav className="my-animal-tabs" aria-label={`${record.animal.name} records`}>
                {(["overview", "medical", "appointments"] as const).map((tab) => (
                  <button type="button" key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                    {tab === "medical" ? "Medical Records" : readable(tab)}{tab === "appointments" && <span className="my-animal-tab-count">{upcomingAppointments.length}</span>}
                  </button>
                ))}
              </nav>
              {activeTab === "overview" && (
                <section className="my-animal-record-panel">
                  <p className="eyebrow">Getting to know {record.animal.name}</p>
                  <h2>A little about {record.animal.name}</h2>
                  {record.animal.description && <p className="my-animal-description">{record.animal.description}</p>}
                  <div className="companion-health-strip">
                    <div><span>Medical clearance</span><strong>{record.animal.medicallyCleared ? "Cleared" : "Not recorded"}</strong>{record.animal.medicalClearanceDate && <small>{displayDate(record.animal.medicalClearanceDate)}</small>}</div>
                    <div><span>Vaccination</span><strong>{readable(record.animal.vaccinationStatus)}</strong><button type="button" className="text-button" onClick={() => setActiveTab("medical")}>View medical records →</button></div>
                  </div>
                  <h3 className="companion-details-heading">Profile details</h3>
                  <dl className="my-animal-overview-facts">
                    <div><dt>Species</dt><dd>{readable(record.animal.type)}</dd></div>
                    <div><dt>Breed</dt><dd>{record.animal.breed || "Not recorded"}</dd></div>
                    <div><dt>Age</dt><dd>{record.animal.estimatedAge || "Not recorded"}</dd></div>
                    <div><dt>Sex</dt><dd>{readable(record.animal.gender)}</dd></div>
                    <div><dt>Colour</dt><dd>{readable(record.animal.colour)}</dd></div>
                    <div><dt>Size</dt><dd>{readable(record.animal.size)}</dd></div>
                  </dl>
                </section>
              )}
              {activeTab === "medical" && (
                <section className="my-animal-record-panel">
                  <h2>Medical records</h2>
                  {record.examinations.length + record.treatments.length + record.carePlan.length === 0 ? (
                    <div className="my-animal-record-empty"><IconPawPrint size={24} /><p>No veterinary records are available yet.</p></div>
                  ) : (
                    <div className="my-animal-medical-timeline">
                      {medicalEntries.map((entry) => entry.kind === "examination" ? (
                        <article className="my-animal-medical-card" key={`exam-${entry.value.id}`}>
                          <p className="eyebrow">Examination · {displayDate(entry.date)}</p>
                          <h3>{entry.value.diagnosis || entry.value.generalCondition}</h3>
                          {entry.value.generalCondition && <p><strong>Assessment:</strong> {entry.value.generalCondition}</p>}
                          {entry.value.injuries && <p><strong>Injuries:</strong> {entry.value.injuries}</p>}
                          {entry.value.observations && <p><strong>Observations:</strong> {entry.value.observations}</p>}
                          {entry.value.notes && <p>{entry.value.notes}</p>}
                        </article>
                      ) : entry.kind === "treatment" ? (
                        <article className="my-animal-medical-card" key={`treatment-${entry.value.id}`}>
                          <p className="eyebrow">Treatment · {displayDate(entry.date)}</p>
                          <h3>{entry.value.details}</h3>
                          {entry.value.medication && <p><strong>Medication:</strong> {entry.value.medication}</p>}
                          {entry.value.notes && <p>{entry.value.notes}</p>}
                        </article>
                      ) : (
                        <article className="my-animal-medical-card" key={`plan-${entry.value.id}`}>
                          <p className="eyebrow">Care plan · {displayDate(entry.date)}</p>
                          <h3>{entry.value.requirementType}</h3>
                          <p><strong>Status:</strong> {readable(entry.value.status)}</p>
                          {entry.value.details && <p>{entry.value.details}</p>}
                          {entry.value.medication && <p><strong>Medication:</strong> {entry.value.medication}</p>}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {activeTab === "appointments" && (
                <section className="my-animal-record-panel">
                  <h2>Appointments</h2>
                  <h3 className="my-animal-subheading">Upcoming appointments</h3>
                  {upcomingAppointments.length === 0 ? (
                    <p className="my-animal-record-empty">No upcoming appointments.</p>
                  ) : (
                    <div className="my-animal-appointment-list">
                      {upcomingAppointments.map((appointment) => (
                        <AppointmentCard key={appointment.id} appointment={appointment} onCancel={() => setCancelTarget(appointment)} />
                      ))}
                    </div>
                  )}
                  <h3 className="my-animal-subheading">Past &amp; cancelled</h3>
                  {pastAppointments.length === 0 ? (
                    <p className="my-animal-record-empty">No past appointments.</p>
                  ) : (
                    <div className="my-animal-appointment-list">
                      {pastAppointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} />)}
                    </div>
                  )}
                </section>
              )}
              </div>
              </div>
            </section>
          )
        ) : (
          <p className="my-animals-loading">Choose an adopted animal to view its records.</p>
        )}
      </main>
      {toast && <SuccessToast message={toast} onDismiss={() => setToast("")} />}
      {cancelTarget && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !cancelling) setCancelTarget(null);
        }}>
          <section className="modal my-animal-cancel-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-appointment-title">
            <div className="modal-header">
              <h2 id="cancel-appointment-title">Cancel this appointment?</h2>
              <button type="button" className="ghost-button modal-close" onClick={() => setCancelTarget(null)} disabled={cancelling} aria-label="Close">✕</button>
            </div>
            <p>{record?.animal.name} · {displayDate(cancelTarget.appointmentDate)} at {displayTime(cancelTarget.appointmentDate)}</p>
            <p>The appointment will be marked cancelled and this time will become available again.</p>
            <div className="my-animal-action-row">
              <button type="button" className="ghost-button" onClick={() => setCancelTarget(null)} disabled={cancelling}>Keep appointment</button>
              <button type="button" className="teal-button" onClick={() => void cancelAppointment()} disabled={cancelling}>{cancelling ? "Cancelling…" : "Confirm cancellation"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
