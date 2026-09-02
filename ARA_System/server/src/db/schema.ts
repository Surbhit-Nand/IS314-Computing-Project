import {
	boolean,
	date,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

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
	medicallyCleared: boolean("medically_cleared").notNull().default(false),
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
	 animalId: uuid("animal_id").references(() => animals.id),
	reporterClerkUserId: text("reporter_clerk_user_id"),
	location: text("location").notNull(),
	conditionDescription: text("condition_description").notNull(),
	urgency: text("urgency").notNull(),
	status: text("status").notNull().default("submitted"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adoptionApplications = pgTable("adoption_applications", {
	id: uuid("id").defaultRandom().primaryKey(),
	 animalId: uuid("animal_id").notNull().references(() => animals.id),
	applicantClerkUserId: text("applicant_clerk_user_id").notNull(),
	homeDetails: text("home_details").notNull(),
	familyDetails: text("family_details").notNull(),
	existingPets: text("existing_pets"),
	 animalExperience: text("animal_experience"),
	status: text("status").notNull().default("submitted"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vetAppointments = pgTable("vet_appointments", {
	id: uuid("id").defaultRandom().primaryKey(),
	 animalId: uuid("animal_id").notNull().references(() => animals.id),
	bookedByClerkUserId: text("booked_by_clerk_user_id").notNull(),
	appointmentDate: timestamp("appointment_date", { withTimezone: true }).notNull(),
	notes: text("notes"),
	source: text("source").notNull().default("online"),
	status: text("status").notNull().default("booked"),
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
	message: text("message"),
	stripeCheckoutSessionId: text("stripe_checkout_session_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
