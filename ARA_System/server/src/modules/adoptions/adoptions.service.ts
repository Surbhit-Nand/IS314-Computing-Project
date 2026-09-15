import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { getAnimalById, updateAnimalProfile } from "../animals/animals.service.js";
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
	| "homeDetails"
	| "familyDetails"
	| "existingPets"
	| "animalExperience"
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
		homeDetails: input.homeDetails,
		familyDetails: input.familyDetails,
		existingPets: input.existingPets ?? null,
		animalExperience: input.animalExperience ?? null,
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

	// Re-fetch so the caller gets the animal display fields + fresh row.
	return findAdoptionApplicationById(updated.id);
}

// The proposal rule is "no public listing until a vet has set
// medically_cleared". That gate is intentionally OFF for this prototype -
// the Veterinary module that would set the flag doesn't exist yet, so the
// team ships with it disabled and this function always returns true. When
// the vet module lands, flip the body to return the animal's clearance flag
// so an animal is only approvable once a vet has cleared it.
async function requireMedicallyCleared(animalId: string): Promise<boolean> {
	void animalId;
	return true;
}

function throwIfInvalidTransition(from: AdoptionStatus, to: AdoptionStatus) {
	const allowed = ALLOWED_TRANSITIONS[from] ?? [];
	if (!allowed.includes(to)) {
		throw new Error(
			`Adoption application cannot move from "${from}" to "${to}" - only ${allowed.length > 0 ? allowed.join(" -> ") : "(terminal state)"} is allowed.`,
		);
	}
}