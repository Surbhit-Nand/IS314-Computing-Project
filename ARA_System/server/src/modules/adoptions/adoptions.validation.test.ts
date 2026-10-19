import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure validation tests for the adoption HTTP layer: the request schemas the
// routes parse and the business-error -> status mapping they apply. Nothing
// here touches a database, Clerk, Cloudinary or mail, so the suite runs with
// dummy credentials and no .env (see AGENTS.md). Deliberately no mock.module -
// these are plain imports, which is why this suite is safe on any Node version.
//
// The schemas live in adoptions.routes.ts, so this imports that module (which
// pulls in express/the service chain at import time). The env vars are set
// before the dynamic import so the module graph loads without real secrets.
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy";
process.env.DATABASE_URL ??= "postgres://dummy:dummy@localhost:5432/dummy";
process.env.CLOUDINARY_CLOUD_NAME ??= "dummy";
process.env.CLOUDINARY_API_KEY ??= "dummy";
process.env.CLOUDINARY_API_SECRET ??= "dummy";

const { applicationSchema, transitionSchema, businessErrorStatus } = await import(
	"./adoptions.routes.js"
);
const { AdoptionBusinessError } = await import("./adoptionErrors.js");

// A complete, valid adult application. Tests clone and break one field at a time.
function validApplication(overrides: Record<string, unknown> = {}) {
	return {
		animalId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
		fullName: "Mere Koro",
		contactNumber: "+679 9900000",
		applicantEmail: "mere@example.com",
		ageBracket: "adult",
		idDocumentType: "voter_card",
		idDocumentUrl: "https://res.cloudinary.com/demo/id.jpg",
		petAllergies: "no",
		respiratoryIssues: "no",
		ownedPetsBefore: "no",
		hasCurrentPets: "no",
		vetCostPlan: "Savings",
		nextOfKinName: "Jone Koro",
		nextOfKinContact: "+679 9900001",
		adoptionFor: "self",
		...overrides,
	};
}

// Mirrors the route: surface the first zod issue's message to the client.
function firstMessage(payload: unknown): string {
	const parsed = applicationSchema.safeParse(payload);
	assert.equal(parsed.success, false, "expected the payload to be rejected");
	return parsed.error.issues[0]!.message;
}

describe("applicationSchema", () => {
	it("accepts a complete adult application", () => {
		const parsed = applicationSchema.safeParse(validApplication());
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("accepts a minor application when all four guardian answers are present", () => {
		const parsed = applicationSchema.safeParse(
			validApplication({
				ageBracket: "minor",
				guardianName: "Jone Koro",
				guardianContact: "+679 9900001",
				guardianRelationship: "parent",
				guardianConsent: true,
			}),
		);
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("accepts a dog application declaring a respiratory condition (gate is species-specific)", () => {
		const parsed = applicationSchema.safeParse(validApplication({ respiratoryIssues: "yes" }));
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("normalizes an empty optional text field to undefined", () => {
		const parsed = applicationSchema.safeParse(
			validApplication({ ownedPetsBefore: "no", previousPetOutcome: "   " }),
		);
		assert.equal(parsed.success, true, JSON.stringify(parsed));
		assert.equal(parsed.data?.previousPetOutcome, undefined);
	});

	it("treats a whitespace-only previous-pet outcome as missing", () => {
		assert.equal(
			firstMessage(validApplication({ ownedPetsBefore: "yes", previousPetOutcome: "   " })),
			"Tell us what happened to your previous pet(s)",
		);
	});

	it("rejects a non-UUID animalId", () => {
		assert.equal(firstMessage(validApplication({ animalId: "not-a-uuid" })), "Link a valid animal");
	});

	it("rejects a missing full name", () => {
		assert.equal(firstMessage(validApplication({ fullName: "" })), "Tell us your full name");
	});

	it("rejects a missing contact number", () => {
		assert.equal(
			firstMessage(validApplication({ contactNumber: "" })),
			"Tell us your contact number",
		);
	});

	it("rejects an invalid email address", () => {
		assert.equal(
			firstMessage(validApplication({ applicantEmail: "mere@" })),
			"Enter a valid email address",
		);
	});

	it("rejects an invalid age bracket", () => {
		assert.equal(
			firstMessage(validApplication({ ageBracket: "child" })),
			"Tell us whether you are 18 or older",
		);
	});

	it("rejects a missing identification document type", () => {
		assert.equal(
			firstMessage(validApplication({ idDocumentType: "" })),
			"Choose your identification document type",
		);
	});

	it("rejects a missing identification document photo URL", () => {
		assert.equal(
			firstMessage(validApplication({ idDocumentUrl: "" })),
			"Upload your identification document photo",
		);
	});

	it("rejects a missing vet cost plan", () => {
		assert.equal(
			firstMessage(validApplication({ vetCostPlan: "" })),
			"Tell us how you will cover veterinary costs",
		);
	});

	it("rejects a missing next-of-kin name", () => {
		assert.equal(
			firstMessage(validApplication({ nextOfKinName: "" })),
			"Tell us who looks after the animal when you are unavailable",
		);
	});

	it("rejects a missing next-of-kin contact", () => {
		assert.equal(
			firstMessage(validApplication({ nextOfKinContact: "" })),
			"Tell us your next of kin's contact number",
		);
	});

	it("rejects a missing adoptionFor choice", () => {
		assert.equal(
			firstMessage(validApplication({ adoptionFor: "" })),
			"Choose who this adoption is for",
		);
	});

	it("rejects a minor application missing guardian consent", () => {
		const message = firstMessage(
			validApplication({
				ageBracket: "minor",
				guardianName: "Jone Koro",
				guardianContact: "+679 9900001",
				guardianRelationship: "parent",
				// guardianConsent omitted
			}),
		);
		assert.equal(message, "Your parent or guardian must consent to this adoption");
	});

	it("rejects a minor application missing the guardian relationship", () => {
		const message = firstMessage(
			validApplication({
				ageBracket: "minor",
				guardianName: "Jone Koro",
				guardianContact: "+679 9900001",
				guardianConsent: true,
			}),
		);
		assert.equal(message, "Choose their relationship to you");
	});

	it("rejects guardian details supplied by an adult applicant", () => {
		const message = firstMessage(
			validApplication({ ageBracket: "adult", guardianName: "Jone Koro" }),
		);
		assert.equal(message, "Guardian details are only needed for applicants under 18");
	});

	it("requires a previous-pet outcome when the applicant has owned pets before", () => {
		const message = firstMessage(validApplication({ ownedPetsBefore: "yes" }));
		assert.equal(message, "Tell us what happened to your previous pet(s)");
	});

	it("requires current-pet details when the applicant has current pets", () => {
		const message = firstMessage(validApplication({ hasCurrentPets: "yes" }));
		assert.equal(message, "Tell us about your current pets");
	});
});

describe("transitionSchema", () => {
	it("accepts a status-only transition", () => {
		const parsed = transitionSchema.safeParse({ status: "under_review" });
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("accepts every reviewer status", () => {
		for (const status of ["submitted", "under_review", "approved", "completed", "rejected"]) {
			assert.equal(transitionSchema.safeParse({ status }).success, true, status);
		}
	});

	it("rejects withdrawal: only the applicant can withdraw, via its own route", () => {
		assert.equal(transitionSchema.safeParse({ status: "withdrawn" }).success, false);
	});

	it("rejects an unknown status", () => {
		assert.equal(transitionSchema.safeParse({ status: "canceled" }).success, false);
	});

	it("normalizes an empty review note to undefined", () => {
		const parsed = transitionSchema.safeParse({ status: "rejected", reviewNotes: "   " });
		assert.equal(parsed.success, true, JSON.stringify(parsed));
		assert.equal(parsed.data?.reviewNotes, undefined);
	});
});

describe("businessErrorStatus", () => {
	it("maps a typed conflict to 409", () => {
		assert.equal(
			businessErrorStatus(
				new AdoptionBusinessError(409, "Another applicant has already been approved for this animal."),
			),
			409,
		);
	});

	it("maps typed lifecycle and permission rejections to their own status", () => {
		assert.equal(
			businessErrorStatus(
				new AdoptionBusinessError(
					400,
					'Adoption application cannot move from "submitted" to "approved" - only under_review, rejected may come next.',
				),
			),
			400,
		);
		assert.equal(
			businessErrorStatus(
				new AdoptionBusinessError(403, "You cannot approve your own adoption application."),
			),
			403,
		);
	});

	it("maps a Postgres unique violation (the real double-approval race) to 409", () => {
		const violation = Object.assign(new Error("duplicate key value violates unique constraint"), {
			code: "23505",
		});
		assert.equal(businessErrorStatus(violation), 409);
	});

	it("maps a unique violation wrapped in a cause chain to 409", () => {
		const inner = Object.assign(new Error("duplicate key value"), { code: "23505" });
		const wrapped = Object.assign(new Error("query failed"), { cause: inner });
		assert.equal(businessErrorStatus(wrapped), 409);
	});

	it("returns null for an unrecognized error (falls through to the 500 handler)", () => {
		assert.equal(businessErrorStatus(new Error("something unexpected")), null);
	});

	it("returns null for a non-Error value", () => {
		assert.equal(businessErrorStatus("boom"), null);
	});
});
