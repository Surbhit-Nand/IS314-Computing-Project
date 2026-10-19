import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createServer } from "node:http";
import { clinicLocalToInstant } from "../myAnimals/myAnimals.schedule.js";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
const { bookAppointment, getAppointmentAnimals, VeterinaryBookingError } = await import("./veterinary.booking.js");
const { createVeterinaryBookingRouter } = await import("./veterinary.routes.js");
type Dependencies = import("./veterinary.booking.js").BookingDependencies;
const animalId = "11111111-1111-4111-8111-111111111111";
// Fixed future clock keeps boundary cases deterministic without live services.
const now = new Date("2026-10-19T00:00:00.000Z");
const valid = { animalId, appointmentDate: clinicLocalToInstant("2026-10-20", "09:00"), purpose: "Follow up" };

function fixture(options: { role?: string; owned?: boolean; blocked?: boolean; missing?: boolean } = {}) {
	const writes: Parameters<Dependencies["create"]>[0][] = [];
	const deps: Dependencies = {
		getUser: async () => ({ publicMetadata: { role: options.role }, banned: options.blocked }),
		findAnimal: async () => options.missing ? undefined : { id: animalId, deletedAt: null },
		findOwnedAnimal: async (_id, actor) => options.owned !== false && actor === "owner" ? { id: animalId } : undefined,
		listBookedAppointments: async () => [],
		listStaffAnimals: async () => [{ id: "staff-visible" }],
		listOwnerAnimals: async (actor) => actor === "owner" ? [{ id: animalId }] : [],
		create: async (input) => { writes.push(input); return { ...input, id: "appointment" }; },
	};
	return { deps, writes };
}

function errorStatus(status: number) {
	return (error: unknown) => error instanceof VeterinaryBookingError && error.status === status;
}

test("booking requires an authenticated actor and rejects non-owned animals", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	for (const [actor, status] of [["", 401], ["outsider", 403]] as const) {
		const { deps, writes } = fixture();
		await assert.rejects(bookAppointment(valid, actor, deps), errorStatus(status));
		assert.equal(writes.length, 0);
	}
});

test("only verified staff roles bypass ownership; revoked or unknown roles do not", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	for (const role of ["staff", "veterinarian", "manager", "admin"]) {
		const { deps, writes } = fixture({ role, owned: false });
		await bookAppointment(valid, "staff-user", deps);
		assert.equal(writes[0].bookedByClerkUserId, "staff-user");
	}
	for (const role of ["dispatcher", "rescuer", "unknown", undefined]) {
		await assert.rejects(bookAppointment(valid, "staff-user", fixture({ role, owned: false }).deps), errorStatus(403));
	}
	await assert.rejects(bookAppointment(valid, "owner", fixture({ role: "veterinarian", blocked: true }).deps), errorStatus(403));
	const locked = fixture(); locked.deps.getUser = async () => ({ publicMetadata: { role: "staff" }, locked: true });
	await assert.rejects(bookAppointment(valid, "owner", locked.deps), errorStatus(403));
});

test("role lookup failures fail closed and missing/deleted animals cannot be booked", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	const unavailable = fixture(); unavailable.deps.getUser = async () => { throw new Error("Clerk unavailable"); };
	await assert.rejects(bookAppointment(valid, "owner", unavailable.deps), errorStatus(503));
	await assert.rejects(bookAppointment(valid, "owner", fixture({ missing: true }).deps), errorStatus(404));
	const deleted = fixture(); deleted.deps.findAnimal = async () => ({ id: animalId, deletedAt: now });
	await assert.rejects(bookAppointment(valid, "owner", deleted.deps), errorStatus(404));
});

test("owners can book their own animals and cannot forge the persisted actor or status", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	const { deps, writes } = fixture();
	const forged = { ...valid, bookedByClerkUserId: "someone-else", status: "cancelled", source: "phone", role: "admin" };
	await bookAppointment(forged, "owner", deps);
	assert.equal(writes.length, 1);
	assert.equal(writes[0].bookedByClerkUserId, "owner");
	assert.equal(writes[0].status, "booked");
	assert.equal(writes[0].source, "owner_booked");
	assert.equal(writes[0].appointmentDate.getTime(), valid.appointmentDate.getTime());
});

test("all roles reject past dates, closed hours/days, off-slot times and fractional timestamps", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	const invalid = [
		new Date(NaN), clinicLocalToInstant("2026-10-17", "09:00"),
		clinicLocalToInstant("2026-10-19", "08:00"),
		clinicLocalToInstant("2026-10-20", "07:30"), clinicLocalToInstant("2026-10-20", "17:00"),
		clinicLocalToInstant("2026-10-24", "13:00"), clinicLocalToInstant("2026-10-25", "09:00"),
		clinicLocalToInstant("2026-10-20", "09:17"),
		new Date(valid.appointmentDate.getTime() + 1000), new Date(valid.appointmentDate.getTime() + 1),
	];
	for (const role of [undefined, "veterinarian", "staff"]) {
		for (const appointmentDate of invalid) {
			const { deps, writes } = fixture({ role });
			await assert.rejects(bookAppointment({ ...valid, appointmentDate }, "owner", deps), errorStatus(400));
			assert.equal(writes.length, 0);
		}
	}
});

test("weekday and Saturday closing slots remain bookable", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	for (const [date, time] of [["2026-10-20", "16:30"], ["2026-10-24", "12:30"]]) {
		const { deps, writes } = fixture();
		await bookAppointment({ ...valid, appointmentDate: clinicLocalToInstant(date, time) }, "owner", deps);
		assert.equal(writes.length, 1);
	}
});

test("occupied slots and database race conflicts return 409 without retrying writes", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	const occupied = fixture(); occupied.deps.listBookedAppointments = async () => [{ appointmentDate: valid.appointmentDate }];
	await assert.rejects(bookAppointment(valid, "owner", occupied.deps), errorStatus(409));
	assert.equal(occupied.writes.length, 0);
	for (const error of [new Error('duplicate key: vet_appointment_slot_unique'), { cause: { code: "23505", constraint: "vet_appointment_slot_unique" } }]) {
		const race = fixture(); let attempts = 0;
		race.deps.create = async () => { attempts++; throw error; };
		await assert.rejects(bookAppointment(valid, "owner", race.deps), errorStatus(409));
		assert.equal(attempts, 1);
	}
});

test("animal picker scopes owners and preserves staff listing access", async () => {
	assert.deepEqual(await getAppointmentAnimals("owner", fixture().deps), [{ id: animalId }]);
	assert.deepEqual(await getAppointmentAnimals("outsider", fixture().deps), []);
	assert.deepEqual(await getAppointmentAnimals("staff-user", fixture({ role: "staff" }).deps), [{ id: "staff-visible" }]);
	await assert.rejects(getAppointmentAnimals("", fixture().deps), errorStatus(401));
});

test("legacy HTTP routes enforce the service checks and use the session actor", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now });
	const { deps, writes } = fixture();
	deps.getUser = async (id) => ({ publicMetadata: { role: id === "staff" ? "staff" : undefined } });
	const app = express(); app.use(express.json());
	app.use(createVeterinaryBookingRouter({
		authenticate: (request, _response, next) => { request.clerkUserId = request.header("x-test-user"); next(); },
		book: (input, actor) => bookAppointment(input, actor, deps),
		list: (actor) => getAppointmentAnimals(actor, deps),
	}));
	const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address(); assert(address && typeof address !== "string");
		const root = `http://127.0.0.1:${address.port}`;
		const send = (actor: string, input = valid) => fetch(`${root}/appointments`, {
			method: "POST", headers: { "Content-Type": "application/json", "x-test-user": actor }, body: JSON.stringify(input),
		});
		assert.equal((await send("")).status, 401);
		assert.equal((await send("outsider")).status, 403);
		assert.equal((await send("owner", { ...valid, appointmentDate: clinicLocalToInstant("2026-10-20", "09:17") })).status, 400);
		assert.equal((await send("owner")).status, 201);
		assert.equal((await send("staff")).status, 201);
		deps.listBookedAppointments = async () => [{ appointmentDate: valid.appointmentDate }];
		assert.equal((await send("owner")).status, 409);
		const list = await fetch(`${root}/booking-animals`, { headers: { "x-test-user": "outsider" } });
		assert.deepEqual(await list.json(), []);
		assert.equal(writes.length, 2);
	} finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
