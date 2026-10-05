import {
	boolean,
	date,
	doublePrecision,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const animalStatus = pgEnum("animal_status", [
	"intake",
	"in_treatment",
	"medically_cleared",
	"adopted",
	"closed",
]);

export const animalType = pgEnum("animal_type", ["dog", "cat", "rabbit", "other"]);

// Whether a vet has recorded any vaccinations for this animal yet. Kept as its
// own field (separate from the medical-clearance workflow) because staff need
// to show it on the public listing regardless of adoption status.
export const vaccinationStatus = pgEnum("vaccination_status", [
	"not_vaccinated",
	"vaccinated",
]);

// Weight-based size bucket, required going forward on new registrations but
// left nullable at the DB level so animals registered before this field
// existed keep working (their `size` is simply null) instead of breaking a
// migration that would otherwise need a value for every existing row.
export const animalSize = pgEnum("animal_size", ["small", "medium", "large", "extra_large"]);

// Triage priority chosen by staff when an animal is registered. Replaces the
// rescue-report urgency for veterinary triage (which stays on rescue_reports
// and is still used by the rescue module). Nullable so animals registered
// before this field existed keep working; new registrations require a value
// (enforced in animals.routes.ts and the registration form).
export const animalPriority = pgEnum("animal_priority", ["critical", "high", "moderate", "routine"]);

export const animals = pgTable("animals", {
	id: uuid("id").defaultRandom().primaryKey(),
	publicId: text("public_id").notNull().unique(),
	name: text("name").notNull(),
	type: animalType("type").notNull(),
	breed: text("breed"),
	estimatedAge: text("estimated_age"),
	gender: text("gender"),
	colour: text("colour"),
	description: text("description"),
	rescueDate: date("rescue_date"),
	behaviour: text("behaviour"),
	rescueHistory: text("rescue_history"),
	photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
	vaccinationStatus: vaccinationStatus("vaccination_status").notNull().default("not_vaccinated"),
	size: animalSize("size"),
	veterinaryPriority: animalPriority("veterinary_priority"),
	medicallyCleared: boolean("medically_cleared").notNull().default(false),
	veterinaryStatus: text("veterinary_status").notNull().default("needs_initial_examination"),
	medicalClearanceDate: timestamp("medical_clearance_date", { withTimezone: true }),
	medicalClearedByClerkUserId: text("medical_cleared_by_clerk_user_id"),
	medicalClearanceNotes: text("medical_clearance_notes"),
	status: animalStatus("status").notNull().default("intake"),
	// Soft delete: set when staff remove a profile (animal passed away,
	// transferred elsewhere, etc). Deliberately NOT reusing the "closed"
	// status value above - that's part of the adoption/vet lifecycle and
	// likely means something different (e.g. case closed after adoption),
	// so overloading it for deletion risks a future collision. A hard
	// DELETE isn't safe here anyway: rescue_reports, adoption_applications,
	// and vet_appointments all have a NOT-ACTION foreign key to animals.id,
	// so deleting a row with any history would fail with a raw DB
	// constraint error, and would destroy the audit trail for rows with none.
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rescueReports = pgTable("rescue_reports", {
	id: uuid("id").defaultRandom().primaryKey(),
	// Public-facing tracking code (e.g. "RESCUE-2026-4821") handed back to the
	// reporter so they - and staff on the phone - can look the report up
	// without needing an account.
	reference: text("reference").notNull().unique(),
	animalId: uuid("animal_id").references(() => animals.id),
	// Reporter contact. reporterClerkUserId is set only when the report comes
	// through an online form while signed in; the name/phone are always
	// captured so phone-in reports (logged by staff) and anonymous online
	// reports are still trackable.
	reporterClerkUserId: text("reporter_clerk_user_id"),
	reporterName: text("reporter_name").notNull().default(""),
	reporterPhone: text("reporter_phone"),
	reporterEmail: text("reporter_email"),
	location: text("location").notNull(),
	// Pin coordinates from the interactive map on the rescue report form.
	// Optional - a reporter can type a location without dropping a pin - but
	// stored whenever chosen so staff can see exactly where the animal is.
	latitude: doublePrecision("latitude"),
	longitude: doublePrecision("longitude"),
	animalType: text("animal_type"),
	animalBreed: text("animal_breed"),
	conditionDescription: text("condition_description").notNull(),
	urgency: text("urgency").notNull(),
	photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
	// 'online' vs 'phone' so the same form/schema serves both entry paths
	// (see AGENTS.md "one code path" risk mitigation).
	source: text("source").notNull().default("online"),
	status: text("status").notNull().default("submitted"),
	// Dispatcher assignment is kept as both a display name and Clerk id so
	// reporter views do not need a live Clerk lookup.
	assignedTo: text("assigned_to"),
	assignedToClerkUserId: text("assigned_to_clerk_user_id"),
	assignedAt: timestamp("assigned_at", { withTimezone: true }),
	officeNote: text("office_note"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One entry per rescue status/progress milestone - the dispatcher's claim,
// each progress update, and the final outcome all land here as a timeline the
// staff queue, dispatcher dashboard, and reporter view share read-only. The
// extra columns (notes/images/outcome) turn the status-change record into a
// full progress update so nothing lives in a parallel table.
export const rescueReportStatusHistory = pgTable("rescue_report_status_history", {
	id: uuid("id").defaultRandom().primaryKey(),
	reportId: uuid("report_id").notNull().references(() => rescueReports.id),
	fromStatus: text("from_status"),
	toStatus: text("to_status").notNull(),
	changedByClerkUserId: text("changed_by_clerk_user_id").notNull(),
	// Display name of the dispatcher who made this update, denormalized like
	// rescue_reports.assignedTo so reporter-facing views don't need a Clerk
	// lookup. Nullable for any legacy rows written before this column existed.
	dispatcherName: text("dispatcher_name"),
	// Progress notes / action plan (start) or the final rescue report (resolve).
	notes: text("notes"),
	// Final rescue outcome, only meaningful on a resolved entry.
	outcome: text("outcome"),
	// Optional extra remarks (also holds the explanation when outcome is "other").
	additionalRemarks: text("additional_remarks"),
	// Cloudinary URLs of progress/evidence images for this update. Separate
	// from the reporter's original rescue report photos.
	imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Optional quick updates a dispatcher can file while a rescue mission is in
// progress: a short note or an evidence photo. Each is timestamped at write
// time (createdAt) - no status change, no forced form. Kept separate from
// rescue_report_status_history (which records the status milestones) so
// "during the rescue" updates never pollute the Submitted -> Assigned -> In
// Progress -> Resolved timeline.
export const rescueMissionUpdates = pgTable("rescue_mission_updates", {
	id: uuid("id").defaultRandom().primaryKey(),
	reportId: uuid("report_id").notNull().references(() => rescueReports.id),
	// 'note' | 'photo'
	updateType: text("update_type").notNull(),
	message: text("message"),
	imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
	createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
	// Display name of the dispatcher who filed the update, denormalized like
	// rescue_reports.assigned_to so reporter views never need a Clerk lookup.
	dispatcherName: text("dispatcher_name"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The single Post-Rescue Debrief required to complete a mission. Exactly one
// debrief per report (reportId is UNIQUE), written together with the
// in_progress -> resolved transition. outcome mirrors RESCUE_OUTCOMES;
// veterinaryPriority is the intake-handoff priority and deliberately separate
// from rescue_reports.urgency (the original rescue urgency is never
// overwritten).
export const rescueDebriefs = pgTable("rescue_debriefs", {
	id: uuid("id").defaultRandom().primaryKey(),
	reportId: uuid("report_id").notNull().unique().references(() => rescueReports.id),
	outcome: text("outcome").notNull(),
	animalCondition: text("animal_condition"),
	whatHappened: text("what_happened").notNull(),
	destinationOrHandoff: text("destination_or_handoff"),
	// 'low' | 'moderate' | 'high' | 'critical' - handoff priority for the
	// Animal Intake team, not the report's original urgency.
	veterinaryPriority: text("veterinary_priority"),
	// Extra context for unsuccessful outcomes (e.g. what was attempted).
	unsuccessfulDetails: text("unsuccessful_details"),
	createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
	dispatcherName: text("dispatcher_name"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One Animal Intake handoff when a mission ends with an Animal Rescued
// outcome. reportId is UNIQUE so a second debrief can never create a second
// handoff - the intake team gets a single item per rescued animal. An animal
// profile is created LATER by the Intake & Profile Management team, so no
// animals link is required (or stored) at dispatch time.
export const rescueIntakeHandoffs = pgTable("rescue_intake_handoffs", {
	id: uuid("id").defaultRandom().primaryKey(),
	reportId: uuid("report_id").notNull().unique().references(() => rescueReports.id),
	// Copied from the original alert so the intake team has the context
	// without joining back to the report.
	animalType: text("animal_type"),
	animalBreed: text("animal_breed"),
	conditionDescription: text("condition_description"),
	// From the debrief (veterinaryPriority), not the report's urgency.
	veterinaryPriority: text("veterinary_priority"),
	destination: text("destination"),
	notes: text("notes"),
	status: text("status").notNull().default("pending"),
	createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
	dispatcherName: text("dispatcher_name"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	receivedAt: timestamp("received_at", { withTimezone: true }),
});

export const adoptionApplications = pgTable(
	"adoption_applications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		animalId: uuid("animal_id").notNull().references(() => animals.id),
		applicantClerkUserId: text("applicant_clerk_user_id").notNull(),
		homeDetails: text("home_details").notNull(),
		familyDetails: text("family_details").notNull(),
		existingPets: text("existing_pets"),
		animalExperience: text("animal_experience"),
		status: text("status").notNull().default("submitted"),
		reviewNotes: text("review_notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	// Partial unique index: only one application per animal can ever reach
	// "approved" or "completed". Any concurrent UPDATE that tries to move a
	// second application for the same animal into one of those statuses will
	// hit a unique-violation (23505), which the service layer translates into
	// a 409 Conflict. Works over the stateless neon-http driver because the
	// guarantee is a single-statement DB constraint, not a multi-statement lock.
	(table) => [
		uniqueIndex("adoption_animal_unique_active")
			.on(table.animalId)
			.where(sql`${table.status} IN ('approved', 'completed')`),
	],
);

export const adoptionStatusHistory = pgTable("adoption_status_history", {
	id: uuid("id").defaultRandom().primaryKey(),
	applicationId: uuid("application_id")
		.notNull()
		.references(() => adoptionApplications.id),
	status: text("status").notNull(),
	changedByClerkUserId: text("changed_by_clerk_user_id"),
	note: text("note"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vetAppointments = pgTable("vet_appointments", {
	id: uuid("id").defaultRandom().primaryKey(),
	 animalId: uuid("animal_id").notNull().references(() => animals.id),
	bookedByClerkUserId: text("booked_by_clerk_user_id").notNull(),
	appointmentDate: timestamp("appointment_date", { withTimezone: true }).notNull(),
	purpose: text("purpose").notNull().default("Follow-up examination"),
	notes: text("notes"),
	visitDetails: text("visit_details"),
	treatmentPerformed: text("treatment_performed"),
	completedAt: timestamp("completed_at", { withTimezone: true }),
	completedByClerkUserId: text("completed_by_clerk_user_id"),
	source: text("source").notNull().default("online"),
	status: text("status").notNull().default("booked"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("vet_appointment_slot_unique").on(table.appointmentDate)]);

export const veterinaryExaminations = pgTable("veterinary_examinations", {
	id: uuid("id").defaultRandom().primaryKey(),
	 animalId: uuid("animal_id").notNull().references(() => animals.id),
	examinationDate: timestamp("examination_date", { mode: "string", withTimezone: true }).notNull(),
	weightKg: doublePrecision("weight_kg"),
	temperatureC: doublePrecision("temperature_c"),
	generalCondition: text("general_condition").notNull(),
	injuries: text("injuries"),
	observations: text("observations"),
	diagnosis: text("diagnosis"),
	notes: text("notes"),
	performedByClerkUserId: text("performed_by_clerk_user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const veterinaryCarePlans = pgTable("veterinary_care_plans", {
	id: uuid("id").defaultRandom().primaryKey(),
	 animalId: uuid("animal_id").notNull().references(() => animals.id),
	requirementType: text("requirement_type").notNull(),
	status: text("status").notNull().default("required"),
	scheduledDate: timestamp("scheduled_date", { mode: "string", withTimezone: true }),
	completedDate: timestamp("completed_date", { mode: "string", withTimezone: true }),
	details: text("details"),
	medication: text("medication"),
	notes: text("notes"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const veterinaryTreatmentHistory = pgTable("veterinary_treatment_history", {
	id: uuid("id").defaultRandom().primaryKey(),
	 animalId: uuid("animal_id").notNull().references(() => animals.id),
	carePlanId: uuid("care_plan_id").references(() => veterinaryCarePlans.id),
	appointmentId: uuid("appointment_id").references(() => vetAppointments.id),
	treatmentDate: date("treatment_date").notNull(),
	details: text("details").notNull(),
	medication: text("medication"),
	notes: text("notes"),
	performedByClerkUserId: text("performed_by_clerk_user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
	id: uuid("id").defaultRandom().primaryKey(),
	actorClerkUserId: text("actor_clerk_user_id").notNull(),
	action: text("action").notNull(),
	entityType: text("entity_type").notNull(),
	entityId: text("entity_id").notNull(),
	metadata: jsonb("metadata").$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Donations are cross-cutting: any visitor can give anonymously, so the
// donor identity is optional (filled in from the Clerk session when present).
// `currency`/`status` have DB defaults so an insert never needs them, and
// `stripeCheckoutSessionId` is reserved for the Stripe hosted-checkout
// integration planned in AGENTS.md (see the Payments section).
export const donationStatus = pgEnum("donation_status", [
	"pending",
	"completed",
	"failed",
	"refunded",
]);

export const donations = pgTable("donations", {
	id: uuid("id").defaultRandom().primaryKey(),
	donorClerkUserId: text("donor_clerk_user_id"),
	donorName: text("donor_name"),
	donorEmail: text("donor_email"),
	amountCents: integer("amount_cents").notNull(),
	currency: text("currency").notNull().default("USD"),
	status: donationStatus("status").notNull().default("completed"),
	// Which method the donor picked in the Donate modal toggle; validated to
	// "card" | "qr" in donations.service.ts before it ever reaches this table.
	paymentMethod: text("payment_method").notNull().default("card"),
	message: text("message"),
	stripeCheckoutSessionId: text("stripe_checkout_session_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// In-app notifications (bell/badge in the UI). Recipients are Clerk user ids -
// there is deliberately no FK because Clerk identities don't live in Postgres.
// Email delivery is a separate best-effort step in services/email.ts; this row
// is the durable record the UI reads, so a failed email never loses the
// notification itself.
export const notifications = pgTable("notifications", {
	id: uuid("id").defaultRandom().primaryKey(),
	recipientClerkUserId: text("recipient_clerk_user_id").notNull(),
	type: text("type").notNull().default("adoption.status_changed"),
	title: text("title").notNull(),
	body: text("body"),
	entityType: text("entity_type"),
	entityId: text("entity_id"),
	readAt: timestamp("read_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
