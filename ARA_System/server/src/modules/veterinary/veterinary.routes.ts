import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireVeterinaryAccess } from "../../middleware/rbac.js";
import { CARE_STATUSES, addTreatment, bookAppointment, changeCarePlan, completeAppointment, createCarePlan, getAppointmentAnimals, getDashboard, getLatestRapidTriageAssessment, getQueue, getRapidTriageHistory, getRecord, getRecords, medicallyClear, recordFollowUpExamination, recordInitialExamination, recordRapidTriageAssessment, updateExamination } from "./veterinary.service.js";
import { rapidTriageAssessmentSchema } from "./veterinary.validation.js";

const idParam = (value: string | string[]) => Array.isArray(value) ? value[0] : value;
const examinationSchema = z.object({ examinationDate: z.string().datetime(), weightKg: z.number().positive().optional(), temperatureC: z.number().optional(), generalCondition: z.string().min(1), injuries: z.string().optional(), observations: z.string().optional(), diagnosis: z.string().optional(), notes: z.string().optional() });
const examinationUpdateSchema = z.object({ examinationDate: z.string().datetime().optional(), weightKg: z.number().positive().optional(), temperatureC: z.number().optional(), generalCondition: z.string().min(1).optional(), injuries: z.string().optional(), observations: z.string().optional(), diagnosis: z.string().optional(), notes: z.string().optional() });
const carePlanSchema = z.object({ requirements: z.array(z.string().trim().min(1).max(120)) });
const careUpdateSchema = z.object({ status: z.enum(CARE_STATUSES), scheduledDate: z.string().datetime().optional(), completedDate: z.string().datetime().optional(), details: z.string().optional(), medication: z.string().optional(), notes: z.string().optional() });
const treatmentSchema = z.object({ carePlanId: z.string().uuid().optional(), appointmentId: z.string().uuid().optional(), treatmentDate: z.string().date(), details: z.string().min(1), medication: z.string().optional(), notes: z.string().optional() });
const appointmentSchema = z.object({ animalId: z.string().uuid(), appointmentDate: z.string().datetime(), purpose: z.string().min(1), notes: z.string().optional() });
const visitSchema = z.object({ visitDetails: z.string().optional(), treatmentPerformed: z.string().optional() });
const clearanceSchema = z.object({ notes: z.string().trim().max(2000).optional() });

function statusFor(error: unknown) {
	return error instanceof Error && (/required|already|booked|Complete or|not found|at least one/.test(error.message)) ? 400 : 500;
}

export const veterinaryRouter = Router();

type RapidTriageRouterDependencies = {
	authenticate?: RequestHandler;
	authorizeVeterinarian?: RequestHandler;
	submitAssessment?: typeof recordRapidTriageAssessment;
	getLatestAssessment?: typeof getLatestRapidTriageAssessment;
	getAssessmentHistory?: typeof getRapidTriageHistory;
};

export function createRapidTriageRouter(dependencies: RapidTriageRouterDependencies = {}) {
	const router = Router({ mergeParams: true });
	const authenticate = dependencies.authenticate ?? requireClerkSession;
	const authorizeVeterinarian = dependencies.authorizeVeterinarian ?? requireVeterinaryAccess;
	const submitAssessment = dependencies.submitAssessment ?? recordRapidTriageAssessment;
	const getLatestAssessment = dependencies.getLatestAssessment ?? getLatestRapidTriageAssessment;
	const getAssessmentHistory = dependencies.getAssessmentHistory ?? getRapidTriageHistory;

	router.post("/", authenticate, authorizeVeterinarian, async (request, response, next) => {
		const parsedAnimalId = z.string().uuid().safeParse(idParam(request.params.animalId));
		if (!parsedAnimalId.success) {
			response.status(400).json({ error: "Invalid animal ID" });
			return;
		}
		const parsed = rapidTriageAssessmentSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "Invalid triage assessment" });
			return;
		}
		if (!request.clerkUserId) {
			response.status(401).json({ error: "Authentication is required" });
			return;
		}

		try {
			response.status(201).json(await submitAssessment(parsedAnimalId.data, parsed.data, request.clerkUserId));
		} catch (error) {
			if (error instanceof Error && error.message === "Animal not found") {
				response.status(404).json({ error: error.message });
				return;
			}
			next(error);
		}
	});

	router.get("/latest", authenticate, authorizeVeterinarian, async (request, response, next) => {
		const parsedAnimalId = z.string().uuid().safeParse(idParam(request.params.animalId));
		if (!parsedAnimalId.success) {
			response.status(400).json({ error: "Invalid animal ID" });
			return;
		}
		try {
			response.json((await getLatestAssessment(parsedAnimalId.data)) ?? null);
		} catch (error) {
			if (error instanceof Error && error.message === "Animal not found") {
				response.status(404).json({ error: error.message });
				return;
			}
			next(error);
		}
	});

	router.get("/history", authenticate, authorizeVeterinarian, async (request, response, next) => {
		const parsedAnimalId = z.string().uuid().safeParse(idParam(request.params.animalId));
		if (!parsedAnimalId.success) {
			response.status(400).json({ error: "Invalid animal ID" });
			return;
		}
		try {
			response.json(await getAssessmentHistory(parsedAnimalId.data));
		} catch (error) {
			if (error instanceof Error && error.message === "Animal not found") {
				response.status(404).json({ error: error.message });
				return;
			}
			next(error);
		}
	});

	return router;
}

veterinaryRouter.use("/animals/:animalId/triage", createRapidTriageRouter());

veterinaryRouter.get("/dashboard", requireClerkSession, requireVeterinaryAccess, async (_request, response, next) => { try { response.json(await getDashboard()); } catch (error) { next(error); } });
veterinaryRouter.get("/queue", requireClerkSession, requireVeterinaryAccess, async (_request, response, next) => { try { response.json(await getQueue()); } catch (error) { next(error); } });
veterinaryRouter.get("/records", requireClerkSession, requireVeterinaryAccess, async (_request, response, next) => { try { response.json(await getRecords()); } catch (error) { next(error); } });
veterinaryRouter.get("/booking-animals", requireClerkSession, async (_request, response, next) => { try { response.json(await getAppointmentAnimals()); } catch (error) { next(error); } });
veterinaryRouter.get("/appointments", requireClerkSession, requireVeterinaryAccess, async (_request, response, next) => { try { response.json(await (await import("./veterinary.repository.js")).listAppointments()); } catch (error) { next(error); } });
veterinaryRouter.post("/appointments", requireClerkSession, async (request, response, next) => { const parsed = appointmentSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid appointment details" }); return; } try { response.status(201).json(await bookAppointment({ ...parsed.data, appointmentDate: new Date(parsed.data.appointmentDate), bookedByClerkUserId: request.clerkUserId as string })); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Appointment booking failed" }); } void next; });
veterinaryRouter.get("/animals/:animalId", requireClerkSession, requireVeterinaryAccess, async (request, response, next) => { try { const record = await getRecord(idParam(request.params.animalId)); if (!record) { response.status(404).json({ error: "Animal not found" }); return; } response.json(record); } catch (error) { next(error); } });
veterinaryRouter.post("/animals/:animalId/examination", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = examinationSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid examination details" }); return; } try { response.status(201).json(await recordInitialExamination(idParam(request.params.animalId), parsed.data, request.clerkUserId as string)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Examination failed" }); } });
veterinaryRouter.post("/animals/:animalId/examinations", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = examinationSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid examination details" }); return; } try { response.status(201).json(await recordFollowUpExamination(idParam(request.params.animalId), parsed.data, request.clerkUserId as string)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Follow-up examination failed" }); } });
veterinaryRouter.patch("/examinations/:id", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = examinationUpdateSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid examination details" }); return; } try { response.json(await updateExamination(idParam(request.params.id), parsed.data)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Examination update failed" }); } });
veterinaryRouter.post("/animals/:animalId/care-plan", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = carePlanSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Select at least one care requirement" }); return; } try { response.status(201).json(await createCarePlan(idParam(request.params.animalId), parsed.data.requirements)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Care plan failed" }); } });
veterinaryRouter.patch("/care-plan/:id", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = careUpdateSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid care-plan update" }); return; } try { response.json(await changeCarePlan(idParam(request.params.id), parsed.data, request.clerkUserId)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Care-plan update failed" }); } });
veterinaryRouter.post("/animals/:animalId/treatments", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = treatmentSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid treatment details" }); return; } try { response.status(201).json(await addTreatment(idParam(request.params.animalId), parsed.data, request.clerkUserId as string)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Treatment failed" }); } });
veterinaryRouter.patch("/appointments/:id", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = visitSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid visit details" }); return; } try { response.json(await completeAppointment(idParam(request.params.id), parsed.data, request.clerkUserId as string)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Appointment update failed" }); } });
veterinaryRouter.post("/animals/:animalId/clearance", requireClerkSession, requireVeterinaryAccess, async (request, response) => { const parsed = clearanceSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ error: "Invalid clearance details" }); return; } try { response.json(await medicallyClear(idParam(request.params.animalId), request.clerkUserId as string, parsed.data.notes)); } catch (error) { response.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Medical clearance failed" }); } });
