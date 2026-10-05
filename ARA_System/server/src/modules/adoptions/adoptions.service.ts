import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { clerkClient } from "../../services/clerkClient.js";
import { sendAdoptionStatusEmail } from "../../services/email.js";
import { getAnimalById, updateAnimalProfile } from "../animals/animals.service.js";
import { createAdoptionStatusNotification } from "../notifications/notifications.service.js";
import {
	createAdoptionApplication,
	createAdoptionStatusHistoryEntry,
	findActiveAdoptionApplication,
	findAdoptionApplicationsByApplicant,
	findAdoptionApplicationById,
	findAdoptionConflict,
	findAdoptionStatusHistoryByApplication,
	findAllAdoptionApplications,
	updateAdoptionApplicationStatus,
} from "./adoptions.repository.js";

export type SubmitAdoptionApplicationInput = Pick<
	Parameters<typeof createAdoptionApplication>[0],
	| "animalId"
	| "fullName"
	| "contactNumber"
	| "applicantEmail"
	| "residentialAddress"
	| "dateOfBirth"
	| "housingType"
	| "tenure"
	| "landlordPetsAllowed"
	| "fencedYard"
	| "householdSize"
	| "childrenAges"
	| "petAllergies"
	| "ownedPetsBefore"
	| "previousPetOutcome"
	| "hasCurrentPets"
	| "currentPetsDetails"
	| "aloneHours"
	| "primaryCaregiver"
	| "dailyRoutine"
	| "vetCostPlan"
	| "travelCarePlan"
	| "adoptionMotivation"
	| "adoptionFor"
	| "householdAgreement"
	| "consentHomeVisit"
	| "agreeReturnToSpca"
	| "confirmAccurate"
>;

// The single adopted lifecycle for an application: submitted -> under_review
// -> approved -> completed, with rejection allowed from submitted or
// under_review. Rejection and completion are terminal - nothing can move
// backwards. kept as text + this const (like rescue) so the route, service
// and UI all read the same list of enum values.
export const ADOPTION_STATUSES = [
	"submitted",
	"under_review",
	"approved",
	"completed",
	"rejected",
] as const;
export type AdoptionStatus = (typeof ADOPTION_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<AdoptionStatus, AdoptionStatus[]> = {
	submitted: ["under_review", "rejected"],
	under_review: ["approved", "rejected"],
	approved: ["completed"],
	completed: [],
	rejected: [],
};

export async function listAdoptionApplications() {
	return findAllAdoptionApplications();
}

export async function listMyAdoptionApplications(clerkUserId: string) {
	return findAdoptionApplicationsByApplicant(clerkUserId);
}

// One application plus its full status history, for the staff review queue
// detail and the applicant's tracking page.
export async function getAdoptionApplicationDetail(id: string) {
	const application = await findAdoptionApplicationById(id);
	if (!application) {
		return undefined;
	}
	const history = await findAdoptionStatusHistoryByApplication(id);
	return { ...application, history };
}

export async function submitAdoptionApplication(
	input: SubmitAdoptionApplicationInput,
	applicantClerkUserId: string,
) {
	const animal = await getAnimalById(input.animalId);
	if (!animal || animal.deletedAt || animal.status === "adopted") {
		throw new Error("This animal is no longer available for adoption.");
	}

	const existing = await findActiveAdoptionApplication(input.animalId, applicantClerkUserId);
	if (existing) {
		throw new Error("You have already applied to adopt this animal.");
	}

	const application = await createAdoptionApplication({
		animalId: input.animalId,
		applicantClerkUserId,
		homeDetails: null,
		familyDetails: null,
		existingPets: null,
		animalExperience: null,
		fullName: input.fullName,
		contactNumber: input.contactNumber,
		applicantEmail: input.applicantEmail,
		residentialAddress: input.residentialAddress,
		dateOfBirth: input.dateOfBirth,
		housingType: input.housingType,
		tenure: input.tenure,
		landlordPetsAllowed: input.landlordPetsAllowed ?? null,
		fencedYard: input.fencedYard,
		householdSize: input.householdSize,
		childrenAges: input.childrenAges ?? null,
		petAllergies: input.petAllergies,
		ownedPetsBefore: input.ownedPetsBefore,
		previousPetOutcome: input.previousPetOutcome ?? null,
		hasCurrentPets: input.hasCurrentPets,
		currentPetsDetails: input.currentPetsDetails ?? null,
		aloneHours: input.aloneHours,
		primaryCaregiver: input.primaryCaregiver,
		dailyRoutine: input.dailyRoutine,
		vetCostPlan: input.vetCostPlan,
		travelCarePlan: input.travelCarePlan,
		adoptionMotivation: input.adoptionMotivation,
		adoptionFor: input.adoptionFor,
		householdAgreement: input.householdAgreement,
		consentHomeVisit: input.consentHomeVisit,
		agreeReturnToSpca: input.agreeReturnToSpca,
		confirmAccurate: input.confirmAccurate,
		status: "submitted",
		reviewNotes: null,
	});

	// The application row is the record; this first history entry is what the
	// adopter's stepper and the staff queue read to show "when" it was submitted.
	// Written as a separate best-effort statement because the neon-http driver
	// doesn't support transactions (see AGENTS.md).
	await createAdoptionStatusHistoryEntry({
		applicationId: application.id,
		status: "submitted",
		changedByClerkUserId: null,
		note: null,
	});

	// Tell the applicant their application landed (in-app row + email).
	// Best-effort: notification/email failure must never fail the submission.
	await notifyApplicantBestEffort({
		recipientClerkUserId: applicantClerkUserId,
		animalName: animal.name ?? null,
		fromStatus: "",
		toStatus: "submitted",
		reviewNote: null,
		applicationId: application.id,
	});

	return application;
}

// Staff action: move an application through its lifecycle and, when reaching
// "completed", take the animal off the public listings in the same call.
export async function transitionAdoptionApplication(
	id: string,
	input: { status: AdoptionStatus; reviewNotes?: string },
	actorClerkUserId: string,
) {
	const application = await findAdoptionApplicationById(id);
	if (!application) {
		return undefined;
	}

	const current = application.status as AdoptionStatus;
	const isChangingStatus = input.status !== current;

	if (isChangingStatus) {
		throwIfInvalidTransition(current, input.status);
	}

	if (input.status === "approved") {
		const cleared = await requireMedicallyCleared(application.animalId);
		if (!cleared) {
			throw new Error("This animal is not yet medically cleared for adoption.");
		}
		const conflict = await findAdoptionConflict(application.animalId, id);
		if (conflict) {
			throw new Error("Another applicant has already been approved for this animal.");
		}
	}

	if (input.status === "rejected" && !input.reviewNotes?.trim()) {
		throw new Error("Add a review note explaining the rejection so the applicant knows why.");
	}

	const updated = await updateAdoptionApplicationStatus(id, {
		status: input.status,
		// Rejections must record their reason; approval notes are optional but
		// kept when given. Review notes on other moves are preserved unless the
		// staff member wrote a new one.
		reviewNotes:
			input.status === "rejected" || input.status === "approved"
				? input.reviewNotes?.trim() ?? null
				: input.reviewNotes ?? undefined,
	});

	// A completed application means the animal has gone to its new home - take
	// it off the public listings (findPublicAnimals filters status != "adopted").
	// Two separate statements (no transaction on neon-http): the application is
	// moved first so the unique-active index already blocks other approvals,
	// then the animal is marked adopted.
	if (input.status === "completed") {
		await updateAnimalProfile(application.animalId, { status: "adopted" });
	}

	await createAdoptionStatusHistoryEntry({
		applicationId: updated.id,
		status: input.status,
		changedByClerkUserId: actorClerkUserId,
		note: isChangingStatus ? (input.reviewNotes ?? null) : null,
	});

	await logAuditEntry({
		actorClerkUserId,
		action: "adoption.application.status_changed",
		entityType: "adoption_application",
		entityId: updated.id,
		metadata: {
			animalId: application.animalId,
			fromStatus: current,
			toStatus: input.status,
		},
	});

	// Tell the applicant about the move (in-app row + email). Best-effort, so
	// a mail outage or Clerk lookup failure never rolls back the transition.
	const refreshed = await findAdoptionApplicationById(updated.id);
	const animalName =
		(refreshed as { animal?: { name?: string | null } } | undefined)?.animal?.name ??
		(application as { animal?: { name?: string | null } }).animal?.name ??
		null;
	await notifyApplicantBestEffort({
		recipientClerkUserId: application.applicantClerkUserId,
		animalName,
		fromStatus: current,
		toStatus: input.status,
		reviewNote: input.reviewNotes ?? null,
		applicationId: updated.id,
	});

	// Re-fetch so the caller gets the animal display fields + fresh row.
	return refreshed;
}

async function requireMedicallyCleared(animalId: string): Promise<boolean> {
	const animal = await getAnimalById(animalId);
	return animal?.medicallyCleared === true;
}

// In-app row first (durable, the UI reads this), email second (transient).
// Every step is wrapped so a failure notifies nobody but breaks nothing -
// the status move itself already committed above.
async function notifyApplicantBestEffort(input: {
	recipientClerkUserId: string;
	animalName: string | null;
	fromStatus: string;
	toStatus: string;
	reviewNote?: string | null;
	applicationId: string;
}) {
	try {
		await createAdoptionStatusNotification(input);
	} catch (error) {
		console.error("[notifications] failed to create adoption notification", error);
	}
	try {
		const clerkUser = await clerkClient.users.getUser(input.recipientClerkUserId);
		const emailAddress =
			clerkUser.primaryEmailAddress?.emailAddress ??
			clerkUser.emailAddresses?.[0]?.emailAddress;
		if (!emailAddress) return;
		await sendAdoptionStatusEmail({
			to: emailAddress,
			animalName: input.animalName,
			toStatus: input.toStatus,
			reviewNote: input.reviewNote,
			applicationId: input.applicationId,
		});
	} catch (error) {
		console.error("[notifications] failed to send adoption email", error);
	}
}

function throwIfInvalidTransition(from: AdoptionStatus, to: AdoptionStatus) {
	const allowed = ALLOWED_TRANSITIONS[from] ?? [];
	if (!allowed.includes(to)) {
		throw new Error(
			`Adoption application cannot move from "${from}" to "${to}" - only ${allowed.length > 0 ? allowed.join(" -> ") : "(terminal state)"} is allowed.`,
		);
	}
}