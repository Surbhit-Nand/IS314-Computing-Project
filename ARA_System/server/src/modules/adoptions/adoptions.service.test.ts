import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Tests for the adoption module's business rules, run without a database.
//
// Every dependency of adoptions.service.ts (the adoptions repository, the
// animals service it calls to load/mark animals, and the shared audit
// service) is replaced with a stub via node:test's mock.module BEFORE the
// service is imported. Each stub forwards to a test-provided implementation
// held in the `impls` map, so individual tests swap behaviour per case while
// the module-namespace functions stay stable.
//
// Run: node --import tsx --experimental-test-module-mocks --test
//   server/src/modules/adoptions/adoptions.service.test.ts

// The stubs share one signature (they never agree on the exact repository
// types), so they're held as untyped callables.
type AnyFunction = (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any

const impls = new Map<string, AnyFunction>();

function repo(name: string, impl?: AnyFunction) {
	if (impl) {
		impls.set(name, impl);
	}
	return impls.get(name) ?? null;
}

function currentImpl(name: string) {
	const fn = impls.get(name);
	if (!fn) {
		throw new Error(`Unexpected call to unmocked "${name}"`);
	}
	return fn;
}

// node:test's mock.module exposes ESM named exports through `namedExports`.
function moduleMock(specifier: string | URL, namedExports: Record<string, unknown>) {
	mock.module(specifier, { namedExports });
}

moduleMock("./adoptions.repository.js", {
	findAllAdoptionApplications: () => currentImpl("findAllAdoptionApplications")(),
	findAdoptionApplicationsByApplicant: (id: string) => currentImpl("findAdoptionApplicationsByApplicant")(id),
	findAdoptionApplicationById: (id: string) => currentImpl("findAdoptionApplicationById")(id),
	findActiveAdoptionApplication: (animalId: string, applicant: string) =>
		currentImpl("findActiveAdoptionApplication")(animalId, applicant),
	findAdoptionConflict: (animalId: string, excludeId: string) =>
		currentImpl("findAdoptionConflict")(animalId, excludeId),
	createAdoptionApplication: (input: unknown) => currentImpl("createAdoptionApplication")(input),
	updateAdoptionApplicationStatus: (id: string, input: unknown) =>
		currentImpl("updateAdoptionApplicationStatus")(id, input),
	createAdoptionStatusHistoryEntry: (input: unknown) => currentImpl("createAdoptionStatusHistoryEntry")(input),
	findAdoptionStatusHistoryByApplication: (applicationId: string) =>
		currentImpl("findAdoptionStatusHistoryByApplication")(applicationId),
});

moduleMock("../animals/animals.service.js", {
	getAnimalById: (id: string) => currentImpl("getAnimalById")(id),
	updateAnimalProfile: (id: string, input: unknown) => currentImpl("updateAnimalProfile")(id, input),
});

moduleMock("../../shared/audit/audit.service.js", {
	logAuditEntry: (input: unknown) => currentImpl("logAuditEntry")(input),
});

// Notification + email side-effects of submit/transition are stubbed the same
// way: the service must notify best-effort, so tests assert the calls happen
// without ever touching a database, Clerk, or mail provider.
moduleMock("../notifications/notifications.service.js", {
	createAdoptionStatusNotification: (input: unknown) =>
		currentImpl("createAdoptionStatusNotification")(input),
	createAdoptionSubmittedStaffNotifications: (input: unknown) =>
		currentImpl("createAdoptionSubmittedStaffNotifications")(input),
});

moduleMock("../../services/email.js", {
	sendAdoptionStatusEmail: (input: unknown) => currentImpl("sendAdoptionStatusEmail")(input),
	sendAdoptionSubmittedStaffEmail: (input: unknown) =>
		currentImpl("sendAdoptionSubmittedStaffEmail")(input),
});

moduleMock("../../services/staffDirectory.js", {
	listStaffContacts: () => currentImpl("listStaffContacts")(),
});

moduleMock("../../services/clerkClient.js", {
	clerkClient: {
		users: {
			getUser: (id: string) => currentImpl("clerkGetUser")(id),
		},
	},
});


const {
	ADOPTION_STATUSES,
	getAdoptionApplicationDetail,
	listAdoptionApplications,
	listMyAdoptionApplications,
	submitAdoptionApplication,
	transitionAdoptionApplication,
	uploadAdoptionIdDocument,
} = await import("./adoptions.service.js");

const APPLICATION_ID = "11111111-1111-1111-1111-111111111111";
const ANIMAL_ID = "22222222-2222-2222-2222-222222222222";
const APPLICANT_ID = "user-applicant";
const ACTOR_ID = "user-staff";

const historySpy: Array<Record<string, unknown>> = [];
const auditSpy: Array<Record<string, unknown>> = [];
const animalUpdateSpy: Array<Record<string, unknown>> = [];
const notificationSpy: Array<Record<string, unknown>> = [];
const emailSpy: Array<Record<string, unknown>> = [];
const staffNotificationSpy: Array<Record<string, unknown>> = [];
const staffEmailSpy: Array<Record<string, unknown>> = [];

function baseApplication(overrides: Record<string, unknown> = {}) {
	return {
		id: APPLICATION_ID,
		animalId: ANIMAL_ID,
		applicantClerkUserId: APPLICANT_ID,
		homeDetails: null,
		familyDetails: null,
		existingPets: null,
		animalExperience: null,
		fullName: "Mere Koro",
		contactNumber: "9900000",
		applicantEmail: "mere@example.com",
		residentialAddress: "Suva",
		ageBracket: "adult",
		guardianName: null,
		guardianContact: null,
		guardianRelationship: null,
		guardianConsent: false,
		idDocumentType: "voter_card",
		idDocumentUrl: "https://res.cloudinary.com/demo/id.jpg",
		housingType: "house",
		fencedYard: "yes",
		petAllergies: "no",
		respiratoryIssues: "no",
		ownedPetsBefore: "no",
		previousPetOutcome: null,
		hasCurrentPets: "no",
		currentPetsDetails: null,
		aloneHours: null,
		primaryCaregiver: null,
		dailyRoutine: null,
		vetCostPlan: "Savings",
		travelCarePlan: null,
		nextOfKinName: "Jone Koro",
		nextOfKinContact: "+679 9900001",
		adoptionFor: "self",
		householdAgreement: "yes",
		consentHomeVisit: true,
		agreeReturnToSpca: true,
		confirmAccurate: true,
		status: "submitted",
		reviewNotes: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		animal: { id: ANIMAL_ID, publicId: "SPCA-2026-1000", name: "Bella", type: "dog", medicallyCleared: true },
		...overrides,
	};
}

function baseAnimal(overrides: Record<string, unknown> = {}) {
	return {
		id: ANIMAL_ID,
		publicId: "SPCA-2026-1000",
		name: "Bella",
		type: "dog",
		breed: null,
		status: "intake",
		deletedAt: null,
		...overrides,
	};
}

// Wires a mutable in-memory application row so transition tests behave like
// the real DB: the service fetches the row (start of the call), the status
// update mutates the same row, and the final re-fetch returns the fresh state.
function statefulApplication(status: string, overrides: Record<string, unknown> = {}) {
	const current = baseApplication({ status, ...overrides });
	repo("findAdoptionApplicationById", async () => current);
	repo("updateAdoptionApplicationStatus", async (_id, data: Record<string, unknown>) => {
		Object.assign(current, data);
		return { ...current };
	});
	return current;
}

function resetImpls() {
	impls.clear();
	historySpy.length = 0;
	auditSpy.length = 0;
	animalUpdateSpy.length = 0;
	notificationSpy.length = 0;
	emailSpy.length = 0;
	staffNotificationSpy.length = 0;
	staffEmailSpy.length = 0;

	repo("findAllAdoptionApplications", async () => []);
	repo("findAdoptionApplicationsByApplicant", async () => []);
	repo("findAdoptionApplicationById", async () => undefined);
	repo("findActiveAdoptionApplication", async () => undefined);
	repo("findAdoptionConflict", async () => undefined);
	repo("findAdoptionStatusHistoryByApplication", async () => []);
	// Approval is gated on veterinary clearance, so the default animal is
	// cleared. Tests that exercise the gate stub this out explicitly.
	repo("getAnimalById", async () => baseAnimal({ medicallyCleared: true }));
	repo("createAdoptionStatusHistoryEntry", async (entry: Record<string, unknown>) => {
		historySpy.push(entry);
		return entry;
	});
	repo("updateAnimalProfile", async (_id, input: Record<string, unknown>) => {
		animalUpdateSpy.push(input);
		return {};
	});
	repo("logAuditEntry", async (entry: Record<string, unknown>) => {
		auditSpy.push(entry);
	});
	repo("createAdoptionStatusNotification", async (entry: Record<string, unknown>) => {
		notificationSpy.push(entry);
		return entry;
	});
	repo("createAdoptionSubmittedStaffNotifications", async (entry: Record<string, unknown>) => {
		staffNotificationSpy.push(entry);
		return [];
	});
	repo("sendAdoptionSubmittedStaffEmail", async (entry: Record<string, unknown>) => {
		staffEmailSpy.push(entry);
		return { sent: true };
	});
	repo("listStaffContacts", async () => [
		{ clerkUserId: "user-staff-1", email: "staff1@example.com", role: "staff" },
		{ clerkUserId: "user-manager-1", email: null, role: "manager" },
	]);
	repo("sendAdoptionStatusEmail", async (entry: Record<string, unknown>) => {
		emailSpy.push(entry);
		return { sent: true };
	});
	repo("clerkGetUser", async () => ({
		primaryEmailAddress: { emailAddress: "applicant@example.com" },
		emailAddresses: [],
	}));
}

beforeEach(resetImpls);

describe("adoptions.service", () => {
	it("declares the full lifecycle statuses", () => {
		assert.deepEqual(ADOPTION_STATUSES, [
			"submitted",
			"under_review",
			"approved",
			"completed",
			"rejected",
		]);
	});

	describe("listAdoptionApplications", () => {
		it("returns everything the repository finds", async () => {
			const rows = [baseApplication(), baseApplication({ id: "other-id" })];
			repo("findAllAdoptionApplications", async () => rows);

			const result = await listAdoptionApplications();
			assert.equal(result, rows);
		});
	});

	describe("listMyAdoptionApplications", () => {
		it("queries by the caller's clerk user id", async () => {
			const rows = [baseApplication()];
			repo("findAdoptionApplicationsByApplicant", async (id: string) => {
				assert.equal(id, APPLICANT_ID);
				return rows;
			});

			const result = await listMyAdoptionApplications(APPLICANT_ID);
			assert.equal(result, rows);
		});
	});

	describe("getAdoptionApplicationDetail", () => {
		it("returns the application joined with its status history", async () => {
			const app = baseApplication();
			const history = [{ status: "submitted", createdAt: new Date() }];
			repo("findAdoptionApplicationById", async () => app);
			repo("findAdoptionStatusHistoryByApplication", async () => history);

			const result = await getAdoptionApplicationDetail(APPLICATION_ID);
			assert.equal(result?.id, app.id);
			assert.equal(result?.history, history);
		});

		it("returns undefined when the application does not exist", async () => {
			repo("findAdoptionApplicationById", async () => undefined);

			const result = await getAdoptionApplicationDetail(APPLICATION_ID);
			assert.equal(result, undefined);
		});
	});

	describe("submitAdoptionApplication", () => {
		const input: Parameters<typeof submitAdoptionApplication>[0] = {
			animalId: ANIMAL_ID,
			fullName: "Mere Koro",
			contactNumber: "9900000",
		applicantEmail: "mere@example.com",
		ageBracket: "adult",
		idDocumentType: "voter_card",
		idDocumentUrl: "https://res.cloudinary.com/demo/id.jpg",
		petAllergies: "no",
		respiratoryIssues: "no",
		ownedPetsBefore: "no",
		previousPetOutcome: undefined,
		hasCurrentPets: "no",
		currentPetsDetails: undefined,
		vetCostPlan: "Savings",
		nextOfKinName: "Jone Koro",
		nextOfKinContact: "+679 9900001",
		adoptionFor: "self",
	};

		it("creates a submitted application and its first history entry", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			const app = await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(app.id, APPLICATION_ID);
			assert.equal(app.animalId, ANIMAL_ID);
			assert.equal(app.applicantClerkUserId, APPLICANT_ID);
			assert.equal(app.status, "submitted");
			assert.equal(app.fullName, "Mere Koro");
			assert.equal(app.adoptionFor, "self");
			assert.equal(app.vetCostPlan, "Savings");
			assert.equal(app.nextOfKinName, "Jone Koro");
			assert.equal(historySpy.length, 1);
			assert.deepEqual(historySpy[0], {
				applicationId: APPLICATION_ID,
				status: "submitted",
				changedByClerkUserId: null,
				note: null,
			});
		});

		it("throws when the animal does not exist", async () => {
			repo("getAnimalById", async () => undefined);

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /no longer available/);
		});

		it("throws when the animal has been soft-deleted", async () => {
			repo("getAnimalById", async () => baseAnimal({ deletedAt: new Date() }));

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /no longer available/);
		});

		it("throws when the animal is already adopted", async () => {
			repo("getAnimalById", async () => baseAnimal({ status: "adopted" }));

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /no longer available/);
		});

		it("throws when the applicant already has an active application for the animal", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => baseApplication());

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /already applied/);
		});

		it("blocks a cat adoption for an applicant with a respiratory condition", async () => {
			repo("getAnimalById", async () => baseAnimal({ type: "cat" }));

			await assert.rejects(
				submitAdoptionApplication({ ...input, respiratoryIssues: "yes" }, APPLICANT_ID),
				/respiratory condition/,
			);
		});

		it("allows a dog adoption for an applicant with a respiratory condition", async () => {
			repo("getAnimalById", async () => baseAnimal({ type: "dog" }));
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			const app = await submitAdoptionApplication(
				{ ...input, respiratoryIssues: "yes" },
				APPLICANT_ID,
			);

			assert.equal(app.id, APPLICATION_ID);
		});

		it("stores guardian details for a minor applicant", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			let stored: Record<string, unknown> = {};
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => {
				stored = data;
				return { id: APPLICATION_ID, ...data };
			});

			await submitAdoptionApplication(
				{
					...input,
					ageBracket: "minor",
					guardianName: "Jone Koro",
					guardianContact: "9900001",
					guardianRelationship: "parent",
					guardianConsent: true,
				},
				APPLICANT_ID,
			);

			assert.equal(stored.guardianName, "Jone Koro");
			assert.equal(stored.guardianConsent, true);
		});

		it("stores the identification document on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			let stored: Record<string, unknown> = {};
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => {
				stored = data;
				return { id: APPLICATION_ID, ...data };
			});

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(stored.idDocumentType, "voter_card");
			assert.equal(stored.idDocumentUrl, "https://res.cloudinary.com/demo/id.jpg");
		});

		it("stores the next-of-kin backup contact on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			let stored: Record<string, unknown> = {};
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => {
				stored = data;
				return { id: APPLICATION_ID, ...data };
			});

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(stored.nextOfKinName, "Jone Koro");
			assert.equal(stored.nextOfKinContact, "+679 9900001");
		});

		it("uploads an ID photo through the injected uploader", async () => {
			const seen: Buffer[] = [];
			const url = await uploadAdoptionIdDocument(Buffer.from("fake-image"), async (file) => {
				seen.push(file);
				return "https://res.cloudinary.com/demo/uploaded.jpg";
			});

			assert.equal(url, "https://res.cloudinary.com/demo/uploaded.jpg");
			assert.equal(seen.length, 1);
		});

		it("notifies the applicant in-app and by email on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(notificationSpy.length, 1);
			assert.equal(notificationSpy[0].recipientClerkUserId, APPLICANT_ID);
			assert.equal(notificationSpy[0].toStatus, "submitted");
			assert.equal(emailSpy.length, 1);
			assert.equal(emailSpy[0].to, "applicant@example.com");
		});

		it("notifies the review team in-app and by email on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(staffNotificationSpy.length, 1);
			assert.deepEqual(staffNotificationSpy[0].staffClerkUserIds, ["user-staff-1", "user-manager-1"]);
			assert.equal(staffNotificationSpy[0].applicationId, APPLICATION_ID);
			// Only the staffer with an email address gets mail.
			assert.equal(staffEmailSpy.length, 1);
			assert.equal(staffEmailSpy[0].to, "staff1@example.com");
		});

		it("still completes the submit when staff notification fails", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));
			repo("listStaffContacts", async () => {
				throw new Error("clerk down");
			});

			const app = await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(app.id, APPLICATION_ID);
			assert.equal(notificationSpy.length, 1);
			assert.equal(staffNotificationSpy.length, 0);
		});
	});

	describe("transitionAdoptionApplication", () => {
		it("returns undefined when the application does not exist", async () => {
			repo("findAdoptionApplicationById", async () => undefined);

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);
			assert.equal(result, undefined);
		});

		it("moves submitted -> under_review and records actor history + audit", async () => {
			const current = statefulApplication("submitted");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);

			assert.equal(result?.status, "under_review");
			assert.equal(historySpy.length, 1);
			assert.equal(historySpy[0].status, "under_review");
			assert.equal(historySpy[0].changedByClerkUserId, ACTOR_ID);
			assert.equal(auditSpy.length, 1);
			assert.equal(auditSpy[0].action, "adoption.application.status_changed");
			assert.deepEqual(auditSpy[0].metadata, {
				animalId: ANIMAL_ID,
				fromStatus: "submitted",
				toStatus: "under_review",
			});
			// Nothing below the lifecycle covers, so the animal is untouched.
			assert.equal(animalUpdateSpy.length, 0);
			assert.equal(current.status, "under_review");
		});

		it("approves the application and assigns the animal to the adopter", async () => {
			const current = statefulApplication("under_review");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID);

			assert.equal(result?.status, "approved");
			assert.equal(current.status, "approved");
			assert.deepEqual(animalUpdateSpy, [{ status: "adopted" }]);
		});

		it("blocks approval when the animal is not medically cleared", async () => {
			const current = statefulApplication("under_review");
			repo("getAnimalById", async () => baseAnimal({ medicallyCleared: false }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/not yet medically cleared/,
			);

			assert.equal(current.status, "under_review");
			assert.equal(animalUpdateSpy.length, 0);
		});

		it("moves approved -> completed and keeps the animal adopted", async () => {
			const current = statefulApplication("approved");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "completed" }, ACTOR_ID);

			assert.equal(result?.status, "completed");
			assert.equal(current.status, "completed");
			assert.deepEqual(animalUpdateSpy, [{ status: "adopted" }]);
		});

		it("rejects submitted -> approved as a direct jump", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication());

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/cannot move from "submitted" to "approved"/,
			);
		});

		it("rejects approved -> rejected (no stepping backwards)", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "approved" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "rejected" }, ACTOR_ID),
				/cannot move from "approved" to "rejected"/,
			);
		});

		it("rejects any move out of the terminal completed state", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "completed" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID),
				/terminal state/,
			);
		});

		it("rejects any move out of the terminal rejected state", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "rejected" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "submitted" }, ACTOR_ID),
				/terminal state/,
			);
		});

		it("requires a review note when rejecting", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication());

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "rejected" }, ACTOR_ID),
				/review note/i,
			);
		});

		it("rejects with a review note and preserves the note on the application", async () => {
			const current = statefulApplication("submitted");

			const result = await transitionAdoptionApplication(
				APPLICATION_ID,
				{ status: "rejected", reviewNotes: "Home visit found no fenced yard" },
				ACTOR_ID,
			);

			assert.equal(result?.status, "rejected");
			assert.equal(current.status, "rejected");
			assert.equal(current.reviewNotes, "Home visit found no fenced yard");
			assert.equal(historySpy[0].status, "rejected");
			assert.equal(historySpy[0].note, "Home visit found no fenced yard");
		});

		it("blocks approval when another application for the animal is already approved", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "under_review" }));
			repo("findAdoptionConflict", async () => baseApplication({ status: "approved" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/Another applicant has already been approved/,
			);
		});

		it("allows a same-status no-op transition but still records it", async () => {
			statefulApplication("submitted");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "submitted" }, ACTOR_ID);

			assert.equal(result?.status, "submitted");
			assert.equal(historySpy.length, 1);
			assert.equal(historySpy[0].note, null);
			assert.equal(auditSpy.length, 1);
			assert.deepEqual(auditSpy[0].metadata, { animalId: ANIMAL_ID, fromStatus: "submitted", toStatus: "submitted" });
		});

		it("notifies the applicant in-app and by email on every transition", async () => {
			statefulApplication("submitted");

			await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);

			assert.equal(notificationSpy.length, 1);
			assert.equal(notificationSpy[0].recipientClerkUserId, APPLICANT_ID);
			assert.equal(notificationSpy[0].toStatus, "under_review");
			assert.equal(emailSpy.length, 1);
			assert.equal(emailSpy[0].toStatus, "under_review");
		});

		it("still completes the transition when notification and email fail", async () => {
			statefulApplication("submitted");
			repo("createAdoptionStatusNotification", async () => {
				throw new Error("db down");
			});
			repo("sendAdoptionStatusEmail", async () => {
				throw new Error("mail down");
			});

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);

			assert.equal(result?.status, "under_review");
			assert.equal(historySpy.length, 1);
			assert.equal(auditSpy.length, 1);
		});
	});
});