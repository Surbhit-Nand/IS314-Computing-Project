import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { clerkClient } from "../../services/clerkClient.js";
import { cloudinary, isCloudinaryConfigured } from "../../services/cloudinaryClient.js";
import { sendAdoptionStatusEmail, sendAdoptionSubmittedStaffEmail } from "../../services/email.js";
import { listStaffContacts } from "../../services/staffDirectory.js";
import { getAnimalById, updateAnimalProfile } from "../animals/animals.service.js";
import {
	createAdoptionStatusNotification,
	createAdoptionSubmittedStaffNotifications,
} from "../notifications/notifications.service.js";
import { AdoptionBusinessError, isUniqueViolation } from "./adoptionErrors.js";
import {
	createAdoptionApplication,
	createAdoptionStatusHistoryEntry,
	deleteAdoptionApplication,
	findActiveAdoptionApplication,
	findAdoptionApplicationsByApplicant,
	findAdoptionApplicationById,
	findAdoptionConflict,
	findAdoptionStatusHistoryByApplication,
	findAdoptionStatusHistoryByApplications,
	findAllAdoptionApplications,
	updateAdoptionApplicationStatus,
} from "./adoptions.repository.js";

export type SubmitAdoptionApplicationInput = Pick<
	Parameters<typeof createAdoptionApplication>[0],
	| "animalId"
	| "fullName"
	| "contactNumber"
	| "applicantEmail"
	| "ageBracket"
	| "guardianName"
	| "guardianContact"
	| "guardianRelationship"
	| "guardianConsent"
	| "idDocumentType"
	| "idDocumentUrl"
	| "petAllergies"
	| "respiratoryIssues"
	| "ownedPetsBefore"
	| "previousPetOutcome"
	| "hasCurrentPets"
	| "currentPetsDetails"
	| "vetCostPlan"
	| "nextOfKinName"
	| "nextOfKinContact"
	| "adoptionFor"
>;

// The adopted lifecycle for an application: submitted -> under_review
// -> approved -> completed, with rejection allowed from submitted or
// under_review and withdrawal allowed by the applicant from either non-terminal
// stage. Rejection, completion and withdrawal are terminal - nothing can move
// backwards. kept as text + this const (like rescue) so the route, service
// and UI all read the same list of enum values.
export const ADOPTION_STATUSES = [
	"submitted",
	"under_review",
	"approved",
	"completed",
	"rejected",
	"withdrawn",
] as const;
export type AdoptionStatus = (typeof ADOPTION_STATUSES)[number];

// Terminal statuses accept no further transitions. Exported so tests can assert
// that every other list of "closed" statuses (e.g. the one the duplicate-
// application check uses in adoptions.repository.ts) stays in step with the
// lifecycle rather than drifting into a fourth hard-coded copy.
export const ALLOWED_TRANSITIONS: Record<AdoptionStatus, AdoptionStatus[]> = {
	submitted: ["under_review", "rejected", "withdrawn"],
	under_review: ["approved", "rejected", "withdrawn"],
	approved: ["completed"],
	completed: [],
	rejected: [],
	withdrawn: [],
};

// Statuses a staff member may move an application into via PATCH. Withdrawal is
// deliberately absent: only the applicant can withdraw (it has its own route),
// so a reviewer can never mark an application withdrawn on the applicant's
// behalf.
export const REVIEWER_STATUSES = [
	"submitted",
	"under_review",
	"approved",
	"completed",
	"rejected",
] as const satisfies readonly AdoptionStatus[];

export interface ListOptions {
	limit?: number;
	offset?: number;
}

export async function listAdoptionApplications(options: ListOptions = {}) {
	return findAllAdoptionApplications(options);
}

// Every application belonging to the signed-in applicant, each carrying its
// full status history. The history is attached here (not fetched per row) so
// the applicant's tracking page never needs the staff-only detail route, which
// used to 403 and leave "Progress history" permanently empty.
export async function listMyAdoptionApplications(clerkUserId: string, options: ListOptions = {}) {
	const applications = await findAdoptionApplicationsByApplicant(clerkUserId, options);
	if (applications.length === 0) {
		return [];
	}
	const history = await findAdoptionStatusHistoryByApplications(
		applications.map((application) => application.id),
	);
	const byApplication = new Map<string, typeof history>();
	for (const entry of history) {
		const bucket = byApplication.get(entry.applicationId) ?? [];
		bucket.push(entry);
		byApplication.set(entry.applicationId, bucket);
	}
	return applications.map((application) => ({
		...application,
		history: byApplication.get(application.id) ?? [],
	}));
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
		throw new AdoptionBusinessError(400, "This animal is no longer available for adoption.");
	}

	// The public listing only shows medically cleared animals, so an applicant
	// reaching the wizard has already passed this. Enforced here too because the
	// endpoint is public to any signed-in account and must not accept an
	// application for an animal the veterinary module has not cleared.
	if (!animal.medicallyCleared) {
		throw new AdoptionBusinessError(400, "This animal is not yet medically cleared for adoption.");
	}

	const existing = await findActiveAdoptionApplication(input.animalId, applicantClerkUserId);
	if (existing) {
		throw new AdoptionBusinessError(400, "You have already applied to adopt this animal.");
	}

	// Health gate, mirroring the medical-clearance gate below: applicants with
	// asthma or a respiratory condition cannot adopt cats. Enforced here (not
	// in the route) because only the service knows the animal's species.
	if (animal.type === "cat" && input.respiratoryIssues === "yes") {
		throw new AdoptionBusinessError(
			400,
			"Applicants with asthma or a respiratory condition cannot adopt cats, for health and safety. Our team can suggest a dog, rabbit or other pet instead.",
		);
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
		residentialAddress: null,
		dateOfBirth: null,
		ageBracket: input.ageBracket,
		guardianName: input.guardianName ?? null,
		guardianContact: input.guardianContact ?? null,
		guardianRelationship: input.guardianRelationship ?? null,
		guardianConsent: input.guardianConsent ?? false,
		idDocumentType: input.idDocumentType,
		idDocumentUrl: input.idDocumentUrl,
		housingType: null,
		tenure: null,
		landlordPetsAllowed: null,
		fencedYard: null,
		householdSize: null,
		childrenAges: null,
		petAllergies: input.petAllergies,
		respiratoryIssues: input.respiratoryIssues,
		ownedPetsBefore: input.ownedPetsBefore,
		previousPetOutcome: input.previousPetOutcome ?? null,
		hasCurrentPets: input.hasCurrentPets,
		currentPetsDetails: input.currentPetsDetails ?? null,
		aloneHours: null,
		primaryCaregiver: null,
		dailyRoutine: null,
		vetCostPlan: input.vetCostPlan,
		travelCarePlan: null,
		nextOfKinName: input.nextOfKinName,
		nextOfKinContact: input.nextOfKinContact,
		adoptionMotivation: null,
		adoptionFor: input.adoptionFor,
		consentHomeVisit: false,
		agreeReturnToSpca: false,
		confirmAccurate: false,
		status: "submitted",
		reviewNotes: null,
	});

	// The application row is the record; this first history entry is what the
	// adopter's stepper and the staff queue read to show "when" it was
	// submitted. neon-http has no transactions, so the history insert is
	// compensated on failure: if it cannot be written, the application row is
	// removed again rather than left history-less (which would silently break
	// the applicant's timeline and stepper).
	try {
		await createAdoptionStatusHistoryEntry({
			applicationId: application.id,
			status: "submitted",
			changedByClerkUserId: null,
			note: null,
		});
	} catch (error) {
		await deleteAdoptionApplication(application.id).catch(() => {
			// The compensating delete can itself fail; the original error below
			// still surfaces so the operator can clean up.
		});
		throw error;
	}

	// Audit the create itself. Status changes are audited in the transition
	// path; without this the submission - the most important event - left no
	// audit row at all. Best-effort: the application and its history already
	// exist and must not be rolled back because an audit write failed.
	try {
		await logAuditEntry({
			actorClerkUserId: applicantClerkUserId,
			action: "adoption.application.submitted",
			entityType: "adoption_application",
			entityId: application.id,
			metadata: { animalId: application.animalId },
		});
	} catch (error) {
		console.error("[adoptions] failed to write submission audit entry", error);
	}

	// Tell the applicant their application landed (in-app row + email).
	// Best-effort: notification/email failure must never fail the submission.
	await notifyApplicantBestEffort({
		recipientClerkUserId: applicantClerkUserId,
		animalName: animal.name ?? null,
		toStatus: "submitted",
		reviewNote: null,
		applicationId: application.id,
	});

	// Tell the review team a new application is waiting (in-app row per
	// staff member + email each). Best-effort like the applicant notify.
	await notifyStaffOfSubmissionBestEffort({
		animalName: animal.name ?? null,
		applicantName: input.fullName ?? null,
		applicationId: application.id,
	});

	return application;
}

// Streams an applicant's identification photo buffer straight to Cloudinary
// (never touching disk) and returns its hosted URL. The URL is stored on the
// application row and shown to staff at review; the document's validity is
// judged by staff, never by this function.
//
// The uploader is an optional collaborator so tests can stub Cloudinary
// without module mocking (see the SearchDependencies pattern in animals).
export async function uploadAdoptionIdDocument(
	fileBuffer: Buffer,
	uploader: (fileBuffer: Buffer) => Promise<string> = uploadIdDocumentToCloudinary,
): Promise<string> {
	if (!isCloudinaryConfigured()) {
		throw new Error(
			"Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before uploading documents.",
		);
	}

	return uploader(fileBuffer);
}

function uploadIdDocumentToCloudinary(fileBuffer: Buffer): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream({ folder: "ara/id-documents" }, (error, result) => {
			if (error || !result) {
				reject(error ?? new Error("Cloudinary upload failed"));
				return;
			}
			resolve(result.secure_url);
		});
		stream.end(fileBuffer);
	});
}

// Staff action: move an application through its lifecycle and, when approved,
// assign the animal to the adopter and take it off the public listings.
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

	// A reviewer must not sign off on their own application: it is a conflict of
	// interest and the one way the applicant/reviewer separation could be
	// bypassed by a staff member. Only the decision steps (approve/complete)
	// need the guard.
	if (
		(input.status === "approved" || input.status === "completed") &&
		application.applicantClerkUserId === actorClerkUserId
	) {
		throw new AdoptionBusinessError(
			403,
			"You cannot approve your own adoption application. Ask another staff member to review it.",
		);
	}

	if (input.status === "approved") {
		const cleared = await requireMedicallyCleared(application.animalId);
		if (!cleared) {
			throw new AdoptionBusinessError(400, "This animal is not yet medically cleared for adoption.");
		}
		const conflict = await findAdoptionConflict(application.animalId, id);
		if (conflict) {
			throw new AdoptionBusinessError(409, "Another applicant has already been approved for this animal.");
		}
	}

	if (input.status === "rejected" && !input.reviewNotes?.trim()) {
		throw new AdoptionBusinessError(400, "Add a review note explaining the rejection so the applicant knows why.");
	}

	// A supplied note is always kept - including on a same-status save, which
	// used to write a history row with the note silently dropped. With no new
	// note, a rejection/approval clears the stored note and any other move
	// leaves it untouched.
	const trimmedNote = input.reviewNotes?.trim() ?? null;
	const reviewNotes =
		trimmedNote ?? (input.status === "rejected" || input.status === "approved" ? null : undefined);

	let updated: Awaited<ReturnType<typeof updateAdoptionApplicationStatus>>;
	try {
		updated = await updateAdoptionApplicationStatus(id, {
			status: input.status,
			reviewNotes,
		});
	} catch (error) {
		// The partial unique index (adoption_animal_unique_active) is the real
		// guarantee that two applications for one animal can never both be
		// approved. A concurrent second approval that slips past the friendly
		// pre-check lands here as a unique violation and is reported as the same
		// 409 - previously this fell through to a 500.
		if (isUniqueViolation(error)) {
			throw new AdoptionBusinessError(
				409,
				"Another applicant has already been approved for this animal.",
			);
		}
		throw error;
	}
	if (!updated) {
		return undefined;
	}

	// Approval transfers ownership to the adopter, so take the animal off the
	// public listings immediately (findPublicAnimals filters status != "adopted").
	// Two separate statements (no transaction on neon-http): the application is
	// moved first so the unique-active index already blocks other approvals,
	// then the animal is marked adopted. Completion re-asserts the same status so
	// applications approved before this ownership rule still end up correct. If
	// the animal update fails we restore the previous status so an approved
	// application never leaves its animal still listed.
	if (input.status === "approved" || input.status === "completed") {
		try {
			await updateAnimalProfile(application.animalId, { status: "adopted" });
		} catch (error) {
			await updateAdoptionApplicationStatus(id, { status: current }).catch(() => {
				// Best-effort undo; the error below still surfaces.
			});
			throw error;
		}
	}

	await createAdoptionStatusHistoryEntry({
		applicationId: updated.id,
		status: input.status,
		changedByClerkUserId: actorClerkUserId,
		note: trimmedNote,
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

	// A rejected application is closed, so the identity document it uploaded has
	// served its purpose: remove the hosted copy (best-effort, never fails the
	// transition).
	if (input.status === "rejected") {
		await deleteIdDocumentBestEffort(application.idDocumentUrl);
	}

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
		toStatus: input.status,
		reviewNote: trimmedNote,
		applicationId: updated.id,
	});

	// Re-fetch so the caller gets the animal display fields + fresh row.
	return refreshed;
}

// Applicant action: withdraw your own application before a decision is made.
// Only the owner may withdraw, and only while the application is still in play
// (submitted/under_review) - terminal applications can never be reopened.
export async function withdrawAdoptionApplication(id: string, actorClerkUserId: string) {
	const application = await findAdoptionApplicationById(id);
	if (!application) {
		return undefined;
	}
	if (application.applicantClerkUserId !== actorClerkUserId) {
		throw new AdoptionBusinessError(403, "You can only withdraw your own adoption application.");
	}

	const current = application.status as AdoptionStatus;
	// Reuses the lifecycle rules: withdrawing an approved/completed/rejected
	// application throws the same "cannot move" error a bad staff move would.
	throwIfInvalidTransition(current, "withdrawn");

	const updated = await updateAdoptionApplicationStatus(id, { status: "withdrawn" });
	if (!updated) {
		return undefined;
	}

	await createAdoptionStatusHistoryEntry({
		applicationId: updated.id,
		status: "withdrawn",
		changedByClerkUserId: actorClerkUserId,
		note: null,
	});

	await logAuditEntry({
		actorClerkUserId,
		action: "adoption.application.withdrawn",
		entityType: "adoption_application",
		entityId: updated.id,
		metadata: { animalId: application.animalId, fromStatus: current, toStatus: "withdrawn" },
	});

	await deleteIdDocumentBestEffort(application.idDocumentUrl);

	// Tell the applicant the cancellation is on record. Like every other status
	// change this is best-effort (in-app row + email), so a mail outage or a
	// Clerk lookup failure never fails the withdrawal that already committed.
	const refreshed = await findAdoptionApplicationById(updated.id);
	const animalName =
		(refreshed as { animal?: { name?: string | null } } | undefined)?.animal?.name ?? null;
	await notifyApplicantBestEffort({
		recipientClerkUserId: actorClerkUserId,
		animalName,
		toStatus: "withdrawn",
		applicationId: updated.id,
	});

	return refreshed;
}

// Best-effort removal of a hosted identity document. Rejected/withdrawn
// applications no longer need the uploaded ID, so we do not leave the photo
// sitting in Cloudinary indefinitely. Never throws: a cleanup failure must not
// affect the applicant or the transition that already committed.
async function deleteIdDocumentBestEffort(documentUrl: string | null | undefined) {
	if (!documentUrl || !isCloudinaryConfigured()) {
		return;
	}
	const publicId = cloudinaryPublicIdFromUrl(documentUrl);
	if (!publicId) {
		return;
	}
	try {
		await cloudinary.uploader.destroy(publicId);
	} catch (error) {
		console.error("[adoptions] failed to delete ID document", error);
	}
}

// Extracts the Cloudinary public id from a delivery URL so the asset can be
// destroyed: .../image/upload/v1700000000/ara/id-documents/<id>.<ext> ->
// "ara/id-documents/<id>". Returns null for anything not hosted on Cloudinary.
export function cloudinaryPublicIdFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "res.cloudinary.com") {
			return null;
		}
		const match = parsed.pathname.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
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
		});
	} catch (error) {
		console.error("[notifications] failed to send adoption email", error);
	}
}

function throwIfInvalidTransition(from: AdoptionStatus, to: AdoptionStatus) {
	const allowed = ALLOWED_TRANSITIONS[from] ?? [];
	if (!allowed.includes(to)) {
		const allowance =
			allowed.length > 0 ? `only ${allowed.join(", ")} may come next` : "it is a terminal state";
		throw new AdoptionBusinessError(
			400,
			`Adoption application cannot move from "${from}" to "${to}" - ${allowance}.`,
		);
	}
}

// New submissions are made by applicants, so the review team would otherwise
// only discover them by opening the queue. Broadcast one in-app row per staff
// member plus an email each - all best-effort, never failing the submission.
async function notifyStaffOfSubmissionBestEffort(input: {
	animalName: string | null;
	applicantName: string | null;
	applicationId: string;
}) {
	let staff: Awaited<ReturnType<typeof listStaffContacts>>;
	try {
		staff = await listStaffContacts();
	} catch (error) {
		console.error("[notifications] failed to list staff contacts", error);
		return;
	}
	if (staff.length === 0) return;
	try {
		await createAdoptionSubmittedStaffNotifications({
			staffClerkUserIds: staff.map((member) => member.clerkUserId),
			animalName: input.animalName,
			applicantName: input.applicantName,
			applicationId: input.applicationId,
		});
	} catch (error) {
		console.error("[notifications] failed to create staff notifications", error);
	}
	for (const member of staff) {
		if (!member.email) continue;
		try {
			await sendAdoptionSubmittedStaffEmail({
				to: member.email,
				animalName: input.animalName,
				applicantName: input.applicantName,
				applicationId: input.applicationId,
			});
		} catch (error) {
			console.error("[notifications] failed to send staff email", error);
		}
	}
}