import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Tests for the veterinary appointment notifications, run without a database.
// The veterinary repository and the notifications service are stubbed via
// node:test's mock.module BEFORE the service is imported, following the same
// pattern as modules/adoptions/adoptions.service.test.ts.
//
// Run: node --import tsx --experimental-test-module-mocks --test
//   server/src/modules/veterinary/veterinary.service.test.ts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => unknown;

const impls = new Map<string, AnyFunction>();
const notificationSpy: Array<Record<string, unknown>> = [];

function currentImpl(name: string) {
	const fn = impls.get(name);
	if (!fn) {
		throw new Error(`Unexpected call to unmocked "${name}"`);
	}
	return fn;
}

function moduleMock(specifier: string | URL, exports: Record<string, unknown>) {
	mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
}

moduleMock("./veterinary.repository.js", {
	clearAnimal: (...args: unknown[]) => currentImpl("clearAnimal")(...args),
	createAppointment: (input: unknown) => currentImpl("createAppointment")(input),
	createCarePlanRequirements: (...args: unknown[]) => currentImpl("createCarePlanRequirements")(...args),
	createExamination: (...args: unknown[]) => currentImpl("createExamination")(...args),
	createTreatment: (input: unknown) => currentImpl("createTreatment")(input),
	findAppointment: (id: string) => currentImpl("findAppointment")(id),
	findCarePlan: (...args: unknown[]) => currentImpl("findCarePlan")(...args),
	findCarePlanTreatment: (...args: unknown[]) => currentImpl("findCarePlanTreatment")(...args),
	findExamination: (...args: unknown[]) => currentImpl("findExamination")(...args),
	findMedicalRecord: (animalId: string) => currentImpl("findMedicalRecord")(animalId),
	listAppointmentAnimals: () => currentImpl("listAppointmentAnimals")(),
	listDashboard: () => currentImpl("listDashboard")(),
	listMedicalQueue: () => currentImpl("listMedicalQueue")(),
	listMedicalRecords: () => currentImpl("listMedicalRecords")(),
	updateAnimalVeterinaryStatus: (...args: unknown[]) => currentImpl("updateAnimalVeterinaryStatus")(...args),
	updateAppointment: (id: string, input: unknown) => currentImpl("updateAppointment")(id, input),
	updateCarePlan: (...args: unknown[]) => currentImpl("updateCarePlan")(...args),
	updateExamination: (...args: unknown[]) => currentImpl("updateExamination")(...args),
});

moduleMock("../notifications/notifications.service.js", {
	notifyUser: (input: unknown) => {
		notificationSpy.push(input as Record<string, unknown>);
		return { id: "notif-1", ...(input as Record<string, unknown>) };
	},
});

const { bookAppointment, completeAppointment } = await import("./veterinary.service.js");

const ANIMAL_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "33333333-3333-3333-3333-333333333333";
const BOOKER_ID = "user-owner";

function baseRecord() {
	return {
		animal: { id: ANIMAL_ID, publicId: "SPCA-2026-1000", name: "Bella" },
		examinations: [],
		carePlan: [],
		treatments: [],
		appointments: [],
	};
}

function baseAppointment(overrides: Record<string, unknown> = {}) {
	return {
		id: APPOINTMENT_ID,
		animalId: ANIMAL_ID,
		bookedByClerkUserId: BOOKER_ID,
		appointmentDate: new Date("2026-10-05T09:00:00Z"),
		purpose: "Follow-up examination",
		source: "online",
		status: "booked",
		...overrides,
	};
}

beforeEach(() => {
	impls.clear();
	notificationSpy.length = 0;
	impls.set("findMedicalRecord", async () => baseRecord());
	impls.set("createAppointment", async (input: Record<string, unknown>) => ({ id: APPOINTMENT_ID, ...input }));
	impls.set("findAppointment", async () => baseAppointment());
	impls.set("updateAppointment", async (_id: string, input: Record<string, unknown>) => ({
		...baseAppointment(),
		...input,
	}));
	impls.set("createTreatment", async (input: unknown) => input);
});

describe("bookAppointment notifications", () => {
	it("notifies the booker when an online appointment is booked", async () => {
		const appointment = (await bookAppointment({
			animalId: ANIMAL_ID,
			bookedByClerkUserId: BOOKER_ID,
			appointmentDate: new Date("2026-10-05T09:00:00Z"),
			purpose: "Follow-up examination",
			source: "online",
		})) as Record<string, unknown>;

		assert.equal(appointment.id, APPOINTMENT_ID);
		assert.equal(notificationSpy.length, 1);
		assert.equal(notificationSpy[0].recipientClerkUserId, BOOKER_ID);
		assert.equal(notificationSpy[0].type, "vet.appointment_booked");
		assert.equal(notificationSpy[0].entityType, "vet_appointment");
		assert.equal(notificationSpy[0].entityId, APPOINTMENT_ID);
	});

	it("stays quiet for phone-source bookings logged by staff", async () => {
		await bookAppointment({
			animalId: ANIMAL_ID,
			bookedByClerkUserId: "user-staff",
			appointmentDate: new Date("2026-10-05T09:00:00Z"),
			purpose: "Follow-up examination",
			source: "phone",
		});

		assert.equal(notificationSpy.length, 0);
	});
});

describe("completeAppointment notifications", () => {
	it("notifies the booker when the visit is completed", async () => {
		await completeAppointment(APPOINTMENT_ID, { treatmentPerformed: "Booster given" }, "user-vet");

		assert.equal(notificationSpy.length, 1);
		assert.equal(notificationSpy[0].recipientClerkUserId, BOOKER_ID);
		assert.equal(notificationSpy[0].type, "vet.appointment_completed");
		assert.equal(notificationSpy[0].entityId, APPOINTMENT_ID);
	});

	it("stays quiet for phone-source appointments", async () => {
		impls.set("findAppointment", async () => baseAppointment({ source: "phone" }));

		await completeAppointment(APPOINTMENT_ID, {}, "user-vet");

		assert.equal(notificationSpy.length, 0);
	});
});
