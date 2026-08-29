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
	medicallyCleared: boolean("medically_cleared").notNull().default(false),
	status: animalStatus("status").notNull().default("intake"),
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
