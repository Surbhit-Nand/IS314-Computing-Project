import { Router, type NextFunction, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requireClerkSession, resolveOptionalClerkUserId } from "../../middleware/auth.js";
import {
	requireDispatcher,
	requireRescueQueueAccess,
	requireStaffOrAbove,
} from "../../middleware/rbac.js";
import { clerkClient } from "../../services/clerkClient.js";
import {
	acceptRescueMission,
	addRescueUpdate,
	claimRescueReport,
	completeRescueDebrief,
	getRescueMissionById,
	getRescueReportById,
	listAvailableRescueReports,
	listIntakeHandoffs,
	listMissionBoard,
	listMissionHistory,
	listMyActiveMissions,
	listMyAssignedRescueReports,
	listMyRescueReports,
	listMyResolvedRescueReports,
	listRescueReports,
	markIntakeHandoffReceived,
	startRescueMission,
	startRescueReport,
	submitRescueReport,
	resolveRescueReport,
	releaseRescueMission,
	RESCUE_OUTCOMES,
	RESCUE_UPDATE_TYPES,
	RescueWorkflowError,
	uploadRescuePhoto,
} from "./rescue.service.js";

// The one schema shared by the public online form and the staff phone-in
// form - identical fields, only `source` changes. Empty strings sent for
// optional contact fields are normalized to absent so they don't get stored
// as blank values.
const optionalText = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value && value !== "" ? value : undefined));

// Latitude/longitude coming from the map pin. Kept as a pair - a report
// either has both coordinates or neither, never a lone value.
const optionalCoordinate = () =>
	z
		.number()
		.min(-180)
		.max(180)
		.optional();

const reportSchema = z
	.object({
		reporterName: z.string().trim().min(1, "A reporter name is required"),
		reporterPhone: optionalText,
		reporterEmail: optionalText,
		location: z.string().trim().min(1, "A location is required"),
		latitude: optionalCoordinate(),
		longitude: optionalCoordinate(),
		animalType: z.enum(["dog", "cat", "rabbit", "other"]).optional(),
		animalBreed: optionalText,
		conditionDescription: z.string().trim().min(1, "A condition description is required"),
		urgency: z.enum(["low", "moderate", "high", "critical"]),
		photoUrls: z.array(z.string().url()).default([]),
		source: z.enum(["online", "phone"]).default("online"),
	})
	.refine(
		(value) => (value.latitude == null) === (value.longitude == null),
		{
			message: "Both latitude and longitude must be provided together",
			path: ["latitude"],
		},
	);

const progressImageUrls = z.array(z.string().url()).default([]);

// Start Rescue: notes/action plan are required; images optional. The new
// status is always "in_progress" - a dispatcher cannot choose it.
const startProgressSchema = z.object({
	notes: z.string().trim().min(1, "Progress notes are required."),
	imageUrls: progressImageUrls,
});

// Complete Rescue: the final report and outcome are required, images and
// remarks optional - except that choosing "other" requires an explanation,
// which rides in additionalRemarks so there's still a single report field.
const resolveProgressSchema = z
	.object({
		notes: z.string().trim().min(1, "A final rescue report is required."),
		outcome: z.enum(RESCUE_OUTCOMES),
		additionalRemarks: optionalText,
		imageUrls: progressImageUrls,
	})
	.refine(
		(value) => value.outcome !== "other" || Boolean(value.additionalRemarks),
		{
			message: 'Please explain the "Other" outcome in the additional remarks.',
			path: ["additionalRemarks"],
		},
	);

// Start a mission. Notes are OPTIONAL - a dispatcher en route must not be
// blocked at a form. Anything entered here is still saved to the timeline.
const startMissionSchema = z.object({
	notes: optionalText,
	imageUrls: progressImageUrls,
});

// Release Mission / Request Handover. A reason is required - the next
// dispatcher sees it on the timeline, so "why was this alert passed back"
// must never be a mystery.
const releaseMissionSchema = z.object({
	reason: z.string().trim().min(1, "A short reason is required."),
});

// Quick update filed while a rescue is in progress: note / photo. Never
// changes status and never requires a form.
const missionUpdateSchema = z.object({
	updateType: z.enum(RESCUE_UPDATE_TYPES),
	message: optionalText,
	imageUrls: progressImageUrls,
});

// Veterinary priority for the intake handoff. Accepts an empty string as
// "not chosen" so an untouched dropdown doesn't fail the whole debrief.
const optionalPriority = z.preprocess(
	(value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
	z.enum(["low", "moderate", "high", "critical"]).optional(),
);

// The single Post-Rescue Debrief. whatHappened always; veterinary priority is
// required in the service layer when the outcome is a rescued animal (so the
// intake handoff is complete). Destination is no longer collected - a rescued
// animal always goes to SPCA Fiji.
const debriefSchema = z.object({
	outcome: z.enum(RESCUE_OUTCOMES),
	whatHappened: z.string().trim().min(1, "A debrief of what happened is required."),
	animalCondition: optionalText,
	veterinaryPriority: optionalPriority,
	unsuccessfulDetails: optionalText,
});

// In-memory storage: the file lives briefly in a request buffer, streams
// straight to Cloudinary, and never touches disk.
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 8 * 1024 * 1024 },
	// The public report form can be reached by anyone, so only allow image
	// content - not e.g. an HTML file being sneaked in as "rescue photo".
	fileFilter: (_request, file, callback) => {
		if (file.mimetype.startsWith("image/")) {
			callback(null, true);
		} else {
			callback(new Error("Only image files can be attached to a rescue report"));
		}
	},
});

// Express types a route param as `string | string[]` because a path pattern
// could in principle capture a param more than once. Our routes only ever
// use a single ":id" segment, so this just narrows it back down to a plain
// string (taking the first value in the unexpected array case).
function getIdParam(value: string | string[]): string {
	return Array.isArray(value) ? value[0] : value;
}

// Picks the human-readable display name for the acting dispatcher (used for
// the assignedTo denormalization and every progress-timeline entry).
async function resolveDispatcherName(clerkUserId: string): Promise<string> {
	const user = await clerkClient.users.getUser(clerkUserId);
	return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Dispatcher";
}

// The workflow validator errors (409: race, 403: not your case, 400: bad
// input) are all safe to show the dispatcher verbatim; anything else falls
// through to the Express error handler.
function sendRescueError(error: unknown, response: Response, next: NextFunction) {
	if (error instanceof RescueWorkflowError) {
		response.status(error.status).json({ error: error.message });
		return;
	}
	next(error);
}

export const rescueRouter = Router();

// Public: upload one photo for a rescue report and return its URL. Available
// without login because reports can be submitted anonymously, but rate/size
// limited like animal uploads.
rescueRouter.post(
	"/upload-photo",
	upload.single("photo"),
	async (request, response, next) => {
		if (!request.file) {
			response.status(400).json({ error: "A photo file is required" });
			return;
		}

		try {
			const url = await uploadRescuePhoto(request.file.buffer);
			response.status(201).json({ url });
		} catch (error) {
			next(error);
		}
	},
);

// Dispatcher-only: upload progress/evidence images for a case update. Kept
// separate from the reporter photo endpoint so progress images land in their
// own Cloudinary folder and only a dispatcher can add them.
rescueRouter.post(
	"/upload-progress-photo",
	requireClerkSession,
	requireDispatcher,
	upload.single("photo"),
	async (request, response, next) => {
		if (!request.file) {
			response.status(400).json({ error: "A photo file is required" });
			return;
		}

		try {
			const url = await uploadRescuePhoto(request.file.buffer, "ara/rescue-progress");
			response.status(201).json({ url });
		} catch (error) {
			next(error);
		}
	},
);

// Public: submit a rescue report, works signed-in or anonymously. Staff use
// the exact same endpoint/form to log phone reports with source "phone".
rescueRouter.post("/", async (request, response, next) => {
	const parsed = reportSchema.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({ error: "Invalid rescue report details" });
		return;
	}

	try {
		const signedInUser = await resolveOptionalClerkUserId(request);
		const report = await submitRescueReport(parsed.data, {
			reporterClerkUserId: signedInUser,
			// Phone reports are logged by staff, so when the caller is signed
			// in and marked it as a phone intake, audit it against them. Online
			// submissions stay unaudited - the reporter is the subject, not an
			// acting staff member.
			actorClerkUserId: parsed.data.source === "phone" ? signedInUser : undefined,
		});
		response.status(201).json(report);
	} catch (error) {
		next(error);
	}
});

// Signed-in reporter: their own reports, for the tracking page/dashboard.
rescueRouter.get("/mine", requireClerkSession, async (request, response, next) => {
	try {
		response.json(await listMyRescueReports(request.clerkUserId as string));
	} catch (error) {
		next(error);
	}
});

// Dispatcher-only tabs. Registered before the "/:id" routes below so the
// literal "dispatcher" segment is never captured as an id.
rescueRouter.get(
	"/dispatcher/available",
	requireClerkSession,
	requireDispatcher,
	async (_request, response, next) => {
		try {
			response.json(await listAvailableRescueReports());
		} catch (error) {
			next(error);
		}
	},
);

rescueRouter.get(
	"/dispatcher/mine",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		try {
			response.json(await listMyAssignedRescueReports(request.clerkUserId as string));
		} catch (error) {
			next(error);
		}
	},
);

rescueRouter.get(
	"/dispatcher/resolved",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		try {
			response.json(await listMyResolvedRescueReports(request.clerkUserId as string));
		} catch (error) {
			next(error);
		}
	},
);

// ---- Rescue Mission workflow (Mission Board / Active Mission / History) ----
// Registered before the "/:id" routes below so the literal "missions" and
// "handoffs" segments are never captured as ids.

// Staff + dispatchers: the Mission Board - active alerts ranked Critical ->
// High -> Moderate -> Low, with search/filtering done client-side.
rescueRouter.get(
	"/missions",
	requireClerkSession,
	requireRescueQueueAccess,
	async (_request, response, next) => {
		try {
			response.json(await listMissionBoard());
		} catch (error) {
			next(error);
		}
	},
);

// Staff + dispatchers: resolved missions, newest first.
rescueRouter.get(
	"/missions/history",
	requireClerkSession,
	requireRescueQueueAccess,
	async (_request, response, next) => {
		try {
			response.json(await listMissionHistory());
		} catch (error) {
			next(error);
		}
	},
);

// Dispatcher-only: their own active missions (assigned + in progress) for the
// Active Mission workspace.
rescueRouter.get(
	"/missions/mine",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		try {
			response.json(await listMyActiveMissions(request.clerkUserId as string));
		} catch (error) {
			next(error);
		}
	},
);

// Staff + dispatchers: full detail for one mission - report, timeline, quick
// updates, debrief, intake handoff, generated summary.
rescueRouter.get(
	"/missions/:id",
	requireClerkSession,
	requireRescueQueueAccess,
	async (request, response, next) => {
		try {
			const mission = await getRescueMissionById(getIdParam(request.params.id));
			if (!mission) {
				response.status(404).json({ error: "Rescue mission not found" });
				return;
			}
			response.json(mission);
		} catch (error) {
			next(error);
		}
	},
);

// Dispatcher-only: Accept Mission. Backed by the guarded single-assignment
// claim, so two dispatchers clicking Accept together cannot both win.
rescueRouter.post(
	"/missions/:id/accept",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		try {
			const name = await resolveDispatcherName(request.clerkUserId as string);
			const mission = await acceptRescueMission(
				getIdParam(request.params.id),
				request.clerkUserId as string,
				name,
			);
			if (!mission) {
				response.status(404).json({ error: "Rescue mission not found" });
				return;
			}
			response.json(mission);
		} catch (error) {
			sendRescueError(error, response, next);
		}
	},
);

// Dispatcher-only: Start Mission. Notes are optional - en-route dispatchers
// must never be blocked at a form.
rescueRouter.post(
	"/missions/:id/start",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		const parsed = startMissionSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid start mission details" });
			return;
		}
		try {
			const name = await resolveDispatcherName(request.clerkUserId as string);
			const mission = await startRescueMission(
				getIdParam(request.params.id),
				request.clerkUserId as string,
				name,
				parsed.data,
			);
			if (!mission) {
				response.status(404).json({ error: "Rescue mission not found" });
				return;
			}
			response.json(mission);
		} catch (error) {
			sendRescueError(error, response, next);
		}
	},
);

// Dispatcher-only: Release Mission (Assigned) / Request Handover (In
// Progress). Only the currently assigned dispatcher may give the alert up; a
// reason is required and shown to the next dispatcher on the timeline. The
// alert clears back to the Mission Board as "awaiting_reassignment".
rescueRouter.post(
	"/missions/:id/release",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		const parsed = releaseMissionSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: parsed.error.issues[0]?.message ?? "A short reason is required." });
			return;
		}
		try {
			const name = await resolveDispatcherName(request.clerkUserId as string);
			const mission = await releaseRescueMission(
				getIdParam(request.params.id),
				request.clerkUserId as string,
				name,
				parsed.data,
			);
			if (!mission) {
				response.status(404).json({ error: "Rescue mission not found" });
				return;
			}
			response.json(mission);
		} catch (error) {
			sendRescueError(error, response, next);
		}
	},
);

// Dispatcher-only: optional quick update while the rescue is in progress
// (note / photo). Timestamped server-side, no status
// change.
rescueRouter.post(
	"/missions/:id/updates",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		const parsed = missionUpdateSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid mission update" });
			return;
		}
		try {
			const name = await resolveDispatcherName(request.clerkUserId as string);
			const result = await addRescueUpdate(
				getIdParam(request.params.id),
				request.clerkUserId as string,
				name,
				parsed.data,
			);
			if (!result) {
				response.status(404).json({ error: "Rescue mission not found" });
				return;
			}
			response.status(201).json(result);
		} catch (error) {
			sendRescueError(error, response, next);
		}
	},
);

// Dispatcher-only: the single Post-Rescue Debrief that completes a mission.
// Only the assigned dispatcher, and only from In Progress - the service's
// guarded transition rejects stale or duplicate submissions.
rescueRouter.post(
	"/missions/:id/debrief",
	requireClerkSession,
	requireDispatcher,
	async (request, response, next) => {
		const parsed = debriefSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid rescue debrief" });
			return;
		}
		try {
			const name = await resolveDispatcherName(request.clerkUserId as string);
			const mission = await completeRescueDebrief(
				getIdParam(request.params.id),
				request.clerkUserId as string,
				name,
				parsed.data,
			);
			if (!mission) {
				response.status(404).json({ error: "Rescue mission not found" });
				return;
			}
			response.json(mission);
		} catch (error) {
			sendRescueError(error, response, next);
		}
	},
);

// Staff and above: the open Animal Intake queue (rescued animals awaiting
// intake). Dispatchers hand off; the intake & profile team receives.
rescueRouter.get(
	"/handoffs",
	requireClerkSession,
	requireStaffOrAbove,
	async (_request, response, next) => {
		try {
			response.json(await listIntakeHandoffs());
		} catch (error) {
			next(error);
		}
	},
);

// Staff and above: mark an intake handoff as received (receivedAt recorded).
rescueRouter.patch(
	"/handoffs/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		try {
			const handoff = await markIntakeHandoffReceived(
				getIdParam(request.params.id),
				request.clerkUserId as string,
			);
			if (!handoff) {
				response.status(404).json({ error: "Intake handoff not found" });
				return;
			}
			response.json(handoff);
		} catch (error) {
			next(error);
		}
	},
);

// Staff-only: the full rescue queue for the dispatch dashboard.
rescueRouter.get("/", requireClerkSession, requireRescueQueueAccess, async (_request, response, next) => {
	try {
		response.json(await listRescueReports());
	} catch (error) {
		next(error);
	}
});

// Staff-only: one report in full, to pre-fill the dispatch panel.
rescueRouter.get(
	"/:id",
	requireClerkSession,
		requireRescueQueueAccess,
	async (request, response, next) => {
		try {
			const report = await getRescueReportById(getIdParam(request.params.id));
			if (!report) {
				response.status(404).json({ error: "Rescue report not found" });
				return;
			}
			response.json(report);
		} catch (error) {
			next(error);
		}
	},
);

// Dispatcher-only claim. The service performs a conditional update, so this
// endpoint is safe when multiple dispatchers click Take Case together.
rescueRouter.post("/:id/claim", requireClerkSession, requireDispatcher, async (request, response, next) => {
	try {
		const name = await resolveDispatcherName(request.clerkUserId as string);
		const report = await claimRescueReport(getIdParam(request.params.id), request.clerkUserId as string, name);
		if (!report) {
			response.status(404).json({ error: "Rescue report not found" });
			return;
		}
		response.json(report);
	} catch (error) {
		if (error instanceof RescueWorkflowError) {
			response.status(error.status).json({ error: error.message });
			return;
		}
		next(error);
	}
});

// Dispatcher-only Start Rescue: requires progress notes, self-sets the
// status to In Progress (the client cannot choose it).
rescueRouter.post("/:id/start", requireClerkSession, requireDispatcher, async (request, response, next) => {
	const parsed = startProgressSchema.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Progress notes are required." });
		return;
	}
	try {
		const name = await resolveDispatcherName(request.clerkUserId as string);
		const report = await startRescueReport(
			getIdParam(request.params.id),
			request.clerkUserId as string,
			name,
			parsed.data,
		);
		if (!report) {
			response.status(404).json({ error: "Rescue report not found" });
			return;
		}
		response.json(report);
	} catch (error) {
		if (error instanceof RescueWorkflowError) {
			response.status(error.status).json({ error: error.message });
			return;
		}
		next(error);
	}
});

// Dispatcher-only Complete Rescue: requires a final report and outcome, and
// only then moves the case to Resolved. There is intentionally no bare
// status-PATCH route - progress always carries a report with it.
rescueRouter.post("/:id/resolve", requireClerkSession, requireDispatcher, async (request, response, next) => {
	const parsed = resolveProgressSchema.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({ error: parsed.error.issues[0]?.message ?? "A final rescue report is required." });
		return;
	}
	try {
		const name = await resolveDispatcherName(request.clerkUserId as string);
		const report = await resolveRescueReport(
			getIdParam(request.params.id),
			request.clerkUserId as string,
			name,
			parsed.data,
		);
		if (!report) {
			response.status(404).json({ error: "Rescue report not found" });
			return;
		}
		response.json(report);
	} catch (error) {
		if (error instanceof RescueWorkflowError) {
			response.status(error.status).json({ error: error.message });
			return;
		}
		next(error);
	}
});