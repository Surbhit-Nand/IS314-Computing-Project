import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	clinicDateTime,
	clinicLocalToInstant,
	clinicSlotTimes,
	isValidClinicDate,
} from "./myAnimals.schedule.js";

describe("clinic appointment schedule", () => {
	it("offers 30-minute slots within weekday clinic hours", () => {
		const slots = clinicSlotTimes("2026-10-12");
		assert.equal(slots.length, 18);
		assert.equal(slots[0], "08:00");
		assert.equal(slots.at(-1), "16:30");
	});

	it("uses Saturday hours and closes on Sunday", () => {
		const saturday = clinicSlotTimes("2026-10-17");
		assert.equal(saturday.length, 10);
		assert.equal(saturday.at(-1), "12:30");
		assert.deepEqual(clinicSlotTimes("2026-10-18"), []);
	});

	it("converts Fiji clinic times to instants and back without changing the slot", () => {
		const instant = clinicLocalToInstant("2026-10-12", "09:30");
		assert.deepEqual(
			{ date: clinicDateTime(instant).date, time: clinicDateTime(instant).time },
			{ date: "2026-10-12", time: "09:30" },
		);
	});

	it("rejects impossible dates", () => {
		assert.equal(isValidClinicDate("2026-02-29"), false);
		assert.equal(isValidClinicDate("2026-10-12"), true);
	});
});
