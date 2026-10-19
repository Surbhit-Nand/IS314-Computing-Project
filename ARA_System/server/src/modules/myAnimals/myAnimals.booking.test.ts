import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookOwnerAppointment } from "./myAnimals.booking.js";
import { clinicLocalToInstant } from "./myAnimals.schedule.js";

type AppointmentInput = {
	animalId: string;
	bookedByClerkUserId: string;
	appointmentDate: Date;
	purpose: string;
	notes: string | null;
};

const todayParts = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Pacific/Fiji",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
}).formatToParts(new Date());
const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
const nextWeekday = new Date(`${todayValues.year}-${todayValues.month}-${todayValues.day}T00:00:00.000Z`);
nextWeekday.setUTCDate(nextWeekday.getUTCDate() + 1);
while (nextWeekday.getUTCDay() === 0 || nextWeekday.getUTCDay() === 6) {
	nextWeekday.setUTCDate(nextWeekday.getUTCDate() + 1);
}
const testDate = nextWeekday.toISOString().slice(0, 10);

function dependencies(options?: {
	owned?: boolean;
	booked?: Date[];
	conflictOnInsert?: boolean;
}) {
	const created: AppointmentInput[] = [];
	return {
		created,
		value: {
			findOwnedAnimal: async (animalId: string, clerkUserId: string) =>
				options?.owned !== false && animalId === "animal-1" && clerkUserId === "adopter-1"
					? { id: animalId }
					: undefined,
			listBookedAppointments: async () =>
				(options?.booked ?? []).map((appointmentDate) => ({ appointmentDate })),
			createOwnerAppointment: async (input: AppointmentInput) => {
				created.push(input);
				if (options?.conflictOnInsert) {
					throw new Error('duplicate key value violates unique constraint "vet_appointment_slot_unique"');
				}
				return { id: "appointment-1" };
			},
		},
	};
}

describe("owner veterinary appointment booking", () => {
	it("denies access and booking when the caller does not own the adopted animal", async () => {
		const deps = dependencies({ owned: false });
		assert.equal(
			await bookOwnerAppointment("animal-1", "other-user", {
				date: testDate,
				time: "09:00",
				reason: "Check-up",
			}, deps.value),
			undefined,
		);
		assert.equal(deps.created.length, 0);
	});

	it("rejects a slot already occupied by any active veterinary appointment", async () => {
		const deps = dependencies({ booked: [clinicLocalToInstant(testDate, "09:00")] });
		await assert.rejects(
			bookOwnerAppointment("animal-1", "adopter-1", {
				date: testDate,
				time: "09:00",
				reason: "Check-up",
			}, deps.value),
			/That appointment time has just been booked/,
		);
		assert.equal(deps.created.length, 0);
	});

	it("maps a concurrent database uniqueness conflict to a safe retry message", async () => {
		const deps = dependencies({ conflictOnInsert: true });
		await assert.rejects(
			bookOwnerAppointment("animal-1", "adopter-1", {
				date: testDate,
				time: "09:30",
				reason: "Vaccination",
			}, deps.value),
			/That appointment time has just been booked/,
		);
		assert.equal(deps.created.length, 1);
	});

	it("binds the appointment to the authenticated adopter and selected animal", async () => {
		const deps = dependencies();
		await bookOwnerAppointment("animal-1", "adopter-1", {
			date: testDate,
			time: "10:00",
			reason: "Routine check-up",
		}, deps.value);
		assert.equal(deps.created[0]?.animalId, "animal-1");
		assert.equal(deps.created[0]?.bookedByClerkUserId, "adopter-1");
		assert.equal(
			deps.created[0]?.appointmentDate.getTime(),
			clinicLocalToInstant(testDate, "10:00").getTime(),
		);
	});
});
