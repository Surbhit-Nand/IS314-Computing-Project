import { Router } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import {
	bookMyAnimalAppointment,
	cancelMyAnimalAppointment,
	getMyAnimalAvailability,
	getMyAnimalRecord,
	getMyAnimals,
} from "./myAnimals.service.js";

const idParam = (value: string | string[]) => Array.isArray(value) ? value[0] : value;
const appointmentInput = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid appointment date."),
	time: z.string().regex(/^\d{2}:(00|30)$/, "Choose an available appointment time."),
	reason: z.string().trim().min(1, "Enter an appointment reason.").max(160),
	notes: z.string().trim().max(2000).optional(),
});

function businessStatus(error: unknown): number | null {
	if (!(error instanceof Error)) return null;
	if (error.message.includes("just been booked")) return 409;
	if (/valid appointment date|Past dates|Past dates and times|clinic hours|could not be cancelled/.test(error.message)) {
		return 400;
	}
	return null;
}

export const myAnimalsRouter = Router();

myAnimalsRouter.use(requireClerkSession);

myAnimalsRouter.get("/", async (request, response, next) => {
	try {
		response.json(await getMyAnimals(request.clerkUserId as string));
	} catch (error) {
		next(error);
	}
});

myAnimalsRouter.get("/:animalId", async (request, response, next) => {
	try {
		const record = await getMyAnimalRecord(idParam(request.params.animalId), request.clerkUserId as string);
		if (!record) {
			response.status(404).json({ error: "Adopted animal not found." });
			return;
		}
		response.json(record);
	} catch (error) {
		next(error);
	}
});

myAnimalsRouter.get("/:animalId/availability", async (request, response, next) => {
	const date = z.string().safeParse(request.query.date);
	if (!date.success) {
		response.status(400).json({ error: "Choose a valid appointment date." });
		return;
	}
	try {
		const availability = await getMyAnimalAvailability(
			idParam(request.params.animalId),
			request.clerkUserId as string,
			date.data,
		);
		if (!availability) {
			response.status(404).json({ error: "Adopted animal not found." });
			return;
		}
		response.json(availability);
	} catch (error) {
		const status = businessStatus(error);
		if (status && error instanceof Error) response.status(status).json({ error: error.message });
		else next(error);
	}
});

myAnimalsRouter.post("/:animalId/appointments", async (request, response, next) => {
	const parsed = appointmentInput.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid appointment details." });
		return;
	}
	try {
		const appointment = await bookMyAnimalAppointment(
			idParam(request.params.animalId),
			request.clerkUserId as string,
			parsed.data,
		);
		if (!appointment) {
			response.status(404).json({ error: "Adopted animal not found." });
			return;
		}
		response.status(201).json(appointment);
	} catch (error) {
		const status = businessStatus(error);
		if (status && error instanceof Error) response.status(status).json({ error: error.message });
		else next(error);
	}
});

myAnimalsRouter.patch("/:animalId/appointments/:appointmentId/cancel", async (request, response, next) => {
	try {
		const result = await cancelMyAnimalAppointment(
			idParam(request.params.animalId),
			idParam(request.params.appointmentId),
			request.clerkUserId as string,
		);
		if (!result) {
			response.status(404).json({ error: "Adopted animal not found." });
			return;
		}
		response.json(result);
	} catch (error) {
		const status = businessStatus(error);
		if (status && error instanceof Error) response.status(status).json({ error: error.message });
		else next(error);
	}
});
