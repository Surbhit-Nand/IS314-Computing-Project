import {
	addClinicDays,
	clinicDateTime,
	clinicLocalToInstant,
	clinicSlotTimes,
	isValidClinicDate,
} from "./myAnimals.schedule.js";

type BookingInput = { date: string; time: string; reason: string; notes?: string };
type AppointmentInput = {
	animalId: string;
	bookedByClerkUserId: string;
	appointmentDate: Date;
	purpose: string;
	notes: string | null;
};
type BookingDependencies = {
	findOwnedAnimal: (animalId: string, clerkUserId: string) => Promise<unknown>;
	listBookedAppointments: (from: Date, to: Date) => Promise<Array<{ appointmentDate: Date }>>;
	createOwnerAppointment: (input: AppointmentInput) => Promise<unknown>;
};

export async function bookOwnerAppointment(
	animalId: string,
	clerkUserId: string,
	input: BookingInput,
	dependencies: BookingDependencies,
) {
	const animal = await dependencies.findOwnedAnimal(animalId, clerkUserId);
	if (!animal) return undefined;
	if (!isValidClinicDate(input.date)) throw new Error("Choose a valid appointment date.");

	const appointmentDate = clinicLocalToInstant(input.date, input.time);
	const allowedTimes = clinicSlotTimes(input.date);
	if (!allowedTimes.includes(input.time)) {
		throw new Error("Choose an appointment time during clinic hours.");
	}
	if (clinicDateTime(new Date()).date > input.date || appointmentDate <= new Date()) {
		throw new Error("Past dates and times cannot be booked.");
	}

	const from = clinicLocalToInstant(input.date, "00:00");
	const to = clinicLocalToInstant(addClinicDays(input.date, 1), "00:00");
	const existing = await dependencies.listBookedAppointments(from, to);
	if (existing.some((appointment) => appointment.appointmentDate.getTime() === appointmentDate.getTime())) {
		throw new Error("That appointment time has just been booked. Please select another available time.");
	}

	try {
		return await dependencies.createOwnerAppointment({
			animalId,
			bookedByClerkUserId: clerkUserId,
			appointmentDate,
			purpose: input.reason,
			notes: input.notes?.trim() || null,
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("vet_appointment_slot_unique")) {
			throw new Error(
				"That appointment time has just been booked. Please select another available time.",
				{ cause: error },
			);
		}
		throw error;
	}
}
