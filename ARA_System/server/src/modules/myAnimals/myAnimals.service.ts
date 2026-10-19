import {
	cancelOwnedAppointment,
	createOwnerAppointment,
	findOwnedAnimal,
	listBookedAppointments,
	listOwnedAnimals,
	listOwnedAppointments,
	listOwnerMedicalRecords,
} from "./myAnimals.repository.js";
import { bookOwnerAppointment } from "./myAnimals.booking.js";
import {
	addClinicDays,
	clinicDateTime,
	clinicLocalToInstant,
	clinicSlotTimes,
	isValidClinicDate,
} from "./myAnimals.schedule.js";

export async function getMyAnimals(clerkUserId: string) {
	return listOwnedAnimals(clerkUserId);
}

export async function getMyAnimalRecord(animalId: string, clerkUserId: string) {
	const animal = await findOwnedAnimal(animalId, clerkUserId);
	if (!animal) return undefined;

	const [medical, appointments] = await Promise.all([
		listOwnerMedicalRecords(animalId),
		listOwnedAppointments(animalId, clerkUserId),
	]);
	return { animal, ...medical, appointments };
}

export async function getMyAnimalAvailability(
	animalId: string,
	clerkUserId: string,
	date: string,
) {
	if (!isValidClinicDate(date)) throw new Error("Choose a valid appointment date.");
	if (!(await findOwnedAnimal(animalId, clerkUserId))) return undefined;

	const clinicToday = clinicDateTime(new Date()).date;
	if (date < clinicToday) throw new Error("Past dates cannot be booked.");

	const slots = clinicSlotTimes(date);
	if (slots.length === 0) return { date, slots: [] };

	const from = clinicLocalToInstant(date, "00:00");
	const to = clinicLocalToInstant(addClinicDays(date, 1), "00:00");
	const booked = await listBookedAppointments(from, to);
	const bookedTimes = new Set(
		booked.map((appointment) => clinicDateTime(appointment.appointmentDate).time),
	);
	const now = new Date();

	return {
		date,
		slots: slots.map((time) => {
			const appointmentDate = clinicLocalToInstant(date, time);
			const isBooked = bookedTimes.has(time);
			return {
				time,
				appointmentDate: appointmentDate.toISOString(),
				available: !isBooked && appointmentDate > now,
				status: isBooked ? "booked" as const : appointmentDate <= now ? "past" as const : "available" as const,
			};
		}),
	};
}

export async function bookMyAnimalAppointment(
	animalId: string,
	clerkUserId: string,
	input: { date: string; time: string; reason: string; notes?: string },
) {
	return bookOwnerAppointment(animalId, clerkUserId, input, {
		findOwnedAnimal,
		listBookedAppointments,
		createOwnerAppointment,
	});
}

export async function cancelMyAnimalAppointment(
	animalId: string,
	appointmentId: string,
	clerkUserId: string,
) {
	if (!(await findOwnedAnimal(animalId, clerkUserId))) return undefined;
	const cancelled = await cancelOwnedAppointment(
		appointmentId,
		animalId,
		clerkUserId,
		new Date(),
	);
	if (!cancelled) throw new Error("This upcoming appointment could not be cancelled.");
	return { id: cancelled.id, status: "cancelled" as const };
}
