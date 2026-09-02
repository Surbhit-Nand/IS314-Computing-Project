import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { cloudinary, isCloudinaryConfigured } from "../../services/cloudinaryClient.js";
import {
	createRescueReport,
	findAllReports,
	findReportById,
	findReportByReference,
	findReportsByReporter,
	updateRescueReport,
} from "./rescue.repository.js";

// Phone reports are created through the exact same path as online ones (see
// AGENTS.md's "one code path" mitigation) - the only difference is `source`.
export type SubmitRescueReportInput = Pick<
	Parameters<typeof createRescueReport>[0],
	| "location"
	| "latitude"
	| "longitude"
	| "conditionDescription"
	| "urgency"
	| "reporterName"
	| "reporterPhone"
	| "reporterEmail"
	| "animalType"
	| "animalBreed"
	| "photoUrls"
	| "source"
>;

// The single accepted lifecycle for a rescue report:
// submitted -> assigned -> rescued -> closed.
// Dispatchers can also move straight from submitted to closed (e.g. a
// no-show/prank call) but never backwards.
export const RESCUE_REPORT_STATUSES = ["submitted", "assigned", "rescued", "closed"] as const;
export type RescueReportStatus = (typeof RESCUE_REPORT_STATUSES)[number];

// Builds a human-readable reference like "RESCUE-2026-4821" and retries with
// a fresh random suffix on the rare chance it collides, so every report gets
// a code the reporter can quote when phoning in or tracking online.
async function generateUniqueReference(): Promise<string> {
	const year = new Date().getFullYear();

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const suffix = Math.floor(1000 + Math.random() * 9000);
		const candidate = `RESCUE-${year}-${suffix}`;
		const existing = await findReportByReference(candidate);
		if (!existing) {
			return candidate;
		}
	}

	throw new Error("Could not generate a unique rescue report reference, please try again");
}

export async function listRescueReports() {
	return findAllReports();
}

export async function getRescueReportById(id: string) {
	return findReportById(id);
}

export async function listMyRescueReports(clerkUserId: string) {
	return findReportsByReporter(clerkUserId);
}

// Creates a new report. Works for anonymous online submissions and for
// staff logging a phone call - the route passes `source` ("online"/"phone")
// and this function keeps a single code path.
export async function submitRescueReport(
	input: SubmitRescueReportInput,
	options: { reporterClerkUserId?: string; actorClerkUserId?: string } = {},
) {
	const reference = await generateUniqueReference();
	const report = await createRescueReport({
		...input,
		reference,
		reporterClerkUserId: options.reporterClerkUserId ?? null,
		photoUrls: input.photoUrls ?? [],
		status: "submitted",
	});

	// Staff phone-in reports are audited against the staff member who logged
	// them. Online anonymous submissions skip the audit (no actor to record) -
	// the report row itself is the record.
	if (options.actorClerkUserId) {
		await logAuditEntry({
			actorClerkUserId: options.actorClerkUserId,
			action: "rescue.report.submitted",
			entityType: "rescue_report",
			entityId: report.id,
			metadata: { reference },
		});
	}

	return report;
}

// Staff dispatch action: assign a rescuer, attach an animal profile, write a
// handling note, and/or move the report through its lifecycle. The status
// transition is validated here (in the application layer) so a report can't
// be flipped to an invalid state by a hand-crafted request.
export async function dispatchRescueReport(
	id: string,
	input: {
		status?: RescueReportStatus;
		assignedTo?: string;
		assignedToClerkUserId?: string;
		officeNote?: string;
		animalId?: string;
	},
	actorClerkUserId: string,
) {
	const report = await findReportById(id);
	if (!report) {
		return undefined;
	}

	let nextStatus = report.status;
	if (input.status && input.status !== report.status) {
		throwIfInvalidTransition(report.status, input.status);
		nextStatus = input.status;
	}

	// A report cannot be moved past "submitted" (to assigned/rescued/closed)
	// until a dispatcher has been assigned. The UI disables those options; this
	// enforces the same rule against a hand-crafted request. An assignment sent
	// in the same update counts, so staff can assign + advance in one save.
	const willHaveDispatcher =
		input.assignedTo !== undefined ? Boolean(input.assignedTo) : Boolean(report.assignedTo);
	if (
		input.status &&
		input.status !== report.status &&
		RESCUE_REPORT_STATUSES.indexOf(input.status) > RESCUE_REPORT_STATUSES.indexOf("submitted") &&
		!willHaveDispatcher
	) {
		throw new Error("Assign a dispatcher before moving the report past Under Review.");
	}

	// Only touch the fields the dispatcher actually changed, so a status-only
	// update never wipes an existing assignment or handling note.
	const changes: Partial<Parameters<typeof updateRescueReport>[1]> = {};
	if (input.status) changes.status = nextStatus;
	if (input.assignedTo !== undefined) changes.assignedTo = input.assignedTo || null;
	if (input.assignedToClerkUserId !== undefined) {
		changes.assignedToClerkUserId = input.assignedToClerkUserId || null;
	}
	if (input.officeNote !== undefined) changes.officeNote = input.officeNote || null;
	if (input.animalId !== undefined) changes.animalId = input.animalId || null;

	const updated = await updateRescueReport(id, changes);

	await logAuditEntry({
		actorClerkUserId,
		action: "rescue.report.dispatched",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: {
			fromStatus: report.status,
			toStatus: updated.status,
			assignedTo: updated.assignedTo,
			reference: updated.reference,
		},
	});

	return updated;
}

// Reports move forward through the lifecycle one step at a time. "closed" is
// a terminal state. Any other change (staying put, going backwards) is
// rejected so the queue can't be corrupted by an accidental reorder.
function throwIfInvalidTransition(from: string, to: RescueReportStatus) {
	const fromIndex = RESCUE_REPORT_STATUSES.indexOf(from as RescueReportStatus);
	const toIndex = RESCUE_REPORT_STATUSES.indexOf(to);
	const isForward = fromIndex !== -1 && toIndex > fromIndex;

	if (!isForward) {
		throw new Error(
			`Rescue report cannot move from "${from}" to "${to}" - status changes must move forward through ${RESCUE_REPORT_STATUSES.join(" -> ")}.`,
		);
	}
}

// Streams an uploaded photo buffer straight to Cloudinary (never touching
// disk) and returns its hosted URL - the same pattern as animal photos, kept
// here because rescue reports have their own public upload endpoint.
export async function uploadRescuePhoto(fileBuffer: Buffer): Promise<string> {
	if (!isCloudinaryConfigured()) {
		throw new Error(
			"Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before uploading photos.",
		);
	}

	return new Promise<string>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream({ folder: "ara/rescue" }, (error, result) => {
			if (error || !result) {
				reject(error ?? new Error("Cloudinary upload failed"));
				return;
			}
			resolve(result.secure_url);
		});
		stream.end(fileBuffer);
	});
}