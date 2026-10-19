import { clerkClient } from "../../services/clerkClient.js";
import { normalizeRole, staffOrAboveRoles } from "../../shared/types/roles.js";
import { findAnimalById } from "../animals/animals.repository.js";
import { bookOwnerAppointment } from "../myAnimals/myAnimals.booking.js";
import { clinicDateTime, clinicLocalToInstant } from "../myAnimals/myAnimals.schedule.js";
import { findOwnedAnimal, listBookedAppointments, listOwnedAnimals } from "../myAnimals/myAnimals.repository.js";
import { createAppointment, listAppointmentAnimals } from "./veterinary.repository.js";

export class VeterinaryBookingError extends Error {
	constructor(message: string, public readonly status: number) { super(message); }
}

type BookingInput = {
	animalId: string;
	appointmentDate: Date;
	purpose: string;
	notes?: string;
};

export type BookingDependencies = {
	getUser: (id: string) => Promise<{ publicMetadata: { role?: unknown }; banned?: boolean; locked?: boolean }>;
	findAnimal: (id: string) => Promise<{ id: string; deletedAt?: Date | null } | undefined>;
	findOwnedAnimal: (id: string, userId: string) => Promise<unknown>;
	listBookedAppointments: typeof listBookedAppointments;
	listStaffAnimals: () => Promise<unknown[]>;
	listOwnerAnimals: (userId: string) => Promise<unknown[]>;
	create: (input: Parameters<typeof createAppointment>[0]) => Promise<unknown>;
};

const bookingDependencies: BookingDependencies = {
	getUser: (id) => clerkClient.users.getUser(id),
	findAnimal: findAnimalById, findOwnedAnimal, listBookedAppointments,
	listStaffAnimals: listAppointmentAnimals, listOwnerAnimals: listOwnedAnimals,
	create: createAppointment,
};

async function canBookForOthers(userId: string, dependencies: BookingDependencies) {
	if (!userId?.trim()) throw new VeterinaryBookingError("Authentication is required", 401);
	let user;
	try { user = await dependencies.getUser(userId); }
	catch { throw new VeterinaryBookingError("Unable to verify booking access. Please try again.", 503); }
	if (user.banned || user.locked) throw new VeterinaryBookingError("Booking access is denied", 403);
	const role = normalizeRole(user.publicMetadata.role);
	return staffOrAboveRoles.some((allowed) => allowed === role);
}

export async function getAppointmentAnimals(userId: string, dependencies = bookingDependencies) {
	return await canBookForOthers(userId, dependencies)
		? dependencies.listStaffAnimals()
		: dependencies.listOwnerAnimals(userId);
}

// Both HTTP endpoints and direct service callers must supply the authenticated
// actor separately. Client-supplied roles, booker IDs and statuses are ignored.
export async function bookAppointment(input: BookingInput, userId: string, dependencies = bookingDependencies) {
	const staffAccess = await canBookForOthers(userId, dependencies);
	if (!staffAccess && !(await dependencies.findOwnedAnimal(input.animalId, userId))) {
		throw new VeterinaryBookingError("You can only book appointments for animals you own", 403);
	}
	const animal = await dependencies.findAnimal(input.animalId);
	if (!animal || animal.deletedAt) throw new VeterinaryBookingError("Animal not found", 404);
	if (!(input.appointmentDate instanceof Date) || !Number.isFinite(input.appointmentDate.getTime())) {
		throw new VeterinaryBookingError("Choose a valid appointment date", 400);
	}
	const local = clinicDateTime(input.appointmentDate);
	// The shared owner workflow validates clinic days, 30-minute slots, future
	// times and occupied slots. Reject seconds/milliseconds before converting to
	// its date/time input so near-slot timestamps cannot slip through rounding.
	if (clinicLocalToInstant(local.date, local.time).getTime() !== input.appointmentDate.getTime()) {
		throw new VeterinaryBookingError("Choose an exact clinic appointment slot", 400);
	}
	if (typeof input.purpose !== "string" || !input.purpose.trim()) {
		throw new VeterinaryBookingError("An appointment purpose is required", 400);
	}
	try {
		return await bookOwnerAppointment(input.animalId, userId, {
			date: local.date, time: local.time, reason: input.purpose.trim(), notes: input.notes,
		}, {
			// Authorization was checked above, including staff access to non-owned
			// animals. Reuse scheduling rules without changing owner-only behavior.
			findOwnedAnimal: async () => animal,
			listBookedAppointments: dependencies.listBookedAppointments,
			createOwnerAppointment: (appointment) => dependencies.create({
				...appointment, source: staffAccess ? "online" : "owner_booked", status: "booked",
			}),
		});
	} catch (error) {
		const candidate = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
		const code = candidate?.code ?? candidate?.cause?.code;
		const constraint = candidate?.constraint ?? candidate?.cause?.constraint;
		if ((code === "23505" && constraint === "vet_appointment_slot_unique") ||
			(error instanceof Error && /vet_appointment_slot_unique|just been booked/.test(error.message))) {
			throw new VeterinaryBookingError("That appointment slot is already booked", 409);
		}
		if (error instanceof Error && /clinic hours|Past dates|valid appointment date/.test(error.message)) {
			throw new VeterinaryBookingError(error.message, 400);
		}
		throw error;
	}
}
