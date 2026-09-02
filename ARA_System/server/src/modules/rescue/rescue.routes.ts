import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireClerkSession, resolveOptionalClerkUserId } from "../../middleware/auth.js";
import { requireStaffOrAbove } from "../../middleware/rbac.js";
import {
	dispatchRescueReport,
	getRescueReportById,
	listMyRescueReports,
	listRescueReports,
	RESCUE_REPORT_STATUSES,
	submitRescueReport,
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

// Staff dispatch: any subset of the dispatch fields, but at least one change.
const dispatchSchema = z
	.object({
		status: z.enum(RESCUE_REPORT_STATUSES).optional(),
		assignedTo: optionalText,
		assignedToClerkUserId: optionalText,
		officeNote: optionalText,
		animalId: z.string().uuid("Link a valid animal").optional(),
	})
	.refine((value) => Object.values(value).some((field) => field !== undefined), {
		message: "Provide at least one dispatch update (status, assignment, note, or animal link)",
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

// Public: track a report by its reference code. Internal fields (staff
// notes) are stripped by the service before it's returned.
// (Removed alongside the public "Track a report" page - the signed-in
// reporter now sees their own reports via GET /mine.)

// Staff-only: the full rescue queue for the dispatch dashboard.
rescueRouter.get("/", requireClerkSession, requireStaffOrAbove, async (_request, response, next) => {
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
	requireStaffOrAbove,
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

// Staff-only: dispatch update - assign a rescuer, attach an animal, add a
// note, or move the report through its lifecycle. Audited.
rescueRouter.patch(
	"/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		const parsed = dispatchSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "Invalid rescue report update" });
			return;
		}

		try {
			const report = await dispatchRescueReport(
				getIdParam(request.params.id),
				parsed.data,
				request.clerkUserId as string,
			);
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