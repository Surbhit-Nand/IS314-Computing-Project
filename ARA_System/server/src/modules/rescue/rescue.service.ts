import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { cloudinary, isCloudinaryConfigured } from "../../services/cloudinaryClient.js";
import {
	addRescueDebrief,
	addRescueMissionUpdate,
	createRescueReport,
	createRescueIntakeHandoff,
	deleteRescueDebrief,
	findAllReports,
	findAssignedReportsByDispatcher,
	findAvailableReports,
	findDebriefByReportIds,
	findInProgressReportsByDispatcher,
	findIntakeHandoffById,
	findIntakeHandoffByReportId,
	findIntakeHandoffsByReportIds,
	findMissionUpdatesByReportIds,
	findPendingIntakeHandoffs,
	findReportById,
	findReportByReference,
	findReportsByReporter,
	findReportsByIds,
	findActiveReportsByDispatcher,
	findResolvedReports,
	findResolvedReportsByDispatcher,
	findStatusHistoryByReportIds,
	addRescueStatusHistoryEntry,
	claimRescueReport as claimRescueReportInRepository,
	deleteStatusHistoryEntry,
	markIntakeHandoffReceived as markIntakeHandoffReceivedInRepository,
	releaseRescueReportAssignment,
	reassignUnassignedRescueReport,
	updateRescueReportStatusConditional,
} from "./rescue.repository.js";
import type {
	rescueDebriefs,
	rescueIntakeHandoffs,
	rescueMissionUpdates,
	rescueReportStatusHistory,
	rescueReports,
} from "../../db/schema.js";

type RescueReportRow = typeof rescueReports.$inferSelect;
type RescueHistoryEntry = typeof rescueReportStatusHistory.$inferSelect;
type RescueMissionUpdateRow = typeof rescueMissionUpdates.$inferSelect;
type RescueDebriefRow = typeof rescueDebriefs.$inferSelect;
type RescueIntakeHandoffRow = typeof rescueIntakeHandoffs.$inferSelect;

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

// `rescued` and `closed` are accepted only as legacy values while old rows are
// migrated. New writes use the Dispatcher workflow below. `awaiting_reassignment`
// is the state a released (never started) or handed-over (mid-rescue) alert
// sits in while it waits on the Mission Board for a new dispatcher.
export const RESCUE_REPORT_STATUSES = [
	"submitted",
	"assigned",
	"in_progress",
	"awaiting_reassignment",
	"resolved",
] as const;
export type RescueReportStatus = (typeof RESCUE_REPORT_STATUSES)[number];

// The strict forward chain used by throwIfInvalidTransition. Releasing and
// handing over deliberately step OFF the chain into `awaiting_reassignment`
// and back onto it again, so they are validated explicitly in their own
// service functions rather than pretending to be a linear next-stop.
const RESCUE_FORWARD_CHAIN = ["submitted", "assigned", "in_progress", "resolved"] as const;

// The outcomes a dispatcher can record when completing a rescue. Kept as text
// in the DB (like rescue_reports.status) so the enum can grow without a
// migration - validated here and in the route before any write.
export const RESCUE_OUTCOMES = [
	"rescued_handed_to_spca",
	"not_located",
	// A rescue was attempted but could not be completed for reasons other than
	// the animal simply not being found (e.g. the animal could not be caught
	// safely, or a well-meaning bystander made rescue unsafe).
	"unsuccessful",
	"other",
] as const;
export type RescueOutcome = (typeof RESCUE_OUTCOMES)[number];

// Outcomes that mean the animal was actually rescued - the only ones that
// produce an Animal Intake handoff for the intake & profile team.
export const RESCUE_SUCCESS_OUTCOMES = ["rescued_handed_to_spca"] as const;

// The optional quick updates a dispatcher can file while a mission is in
// progress. They never change status - just timestamped evidence attached to
// the mission (see AGENTS.md "no forced forms during a rescue").
export const RESCUE_UPDATE_TYPES = ["note", "photo"] as const;
export type RescueUpdateType = (typeof RESCUE_UPDATE_TYPES)[number];

// Mission Board ranking: Critical -> High -> Moderate -> Low, then oldest
// first within a band. Unknown urgencies sink to the bottom of the board
// rather than being dropped.
export const URGENCY_RANK: Record<string, number> = {
	critical: 0,
	high: 1,
	moderate: 2,
	low: 3,
};

export type RescueMission = RescueReportRow & {
	progress: RescueHistoryEntry[];
	updates: RescueMissionUpdateRow[];
	debrief: RescueDebriefRow | null;
	intakeHandoff: RescueIntakeHandoffRow | null;
	summary: string;
};

export class RescueWorkflowError extends Error {
	constructor(message: string, public readonly status: number) {
		super(message);
		this.name = "RescueWorkflowError";
	}
}

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

// Attaches the full progress timeline to a batch of reports. Every entry
// (claim, start, resolve) is loaded in one query and grouped by report id so
// list responses carry the timeline without an N+1.
export async function attachProgress(
	reports: RescueReportRow[],
): Promise<(RescueReportRow & { progress: RescueHistoryEntry[] })[]> {
	if (reports.length === 0) return [];
	const history = await findStatusHistoryByReportIds(reports.map((report) => report.id));
	const grouped = new Map<string, RescueHistoryEntry[]>();
	for (const entry of history) {
		const list = grouped.get(entry.reportId) ?? [];
		list.push(entry);
		grouped.set(entry.reportId, list);
	}
	return reports.map((report) => ({ ...report, progress: grouped.get(report.id) ?? [] }));
}

export async function getProgressForReport(reportId: string): Promise<RescueHistoryEntry[]> {
	return findStatusHistoryByReportIds([reportId]);
}

// ---- formatting helpers shared by the generated mission summary ----

function formatTimestamp(date: Date): string {
	return date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const STATUS_LABELS: Record<string, string> = {
	submitted: "Report submitted (under review)",
	assigned: "Dispatcher assigned",
	in_progress: "Mission started",
	awaiting_reassignment: "Awaiting reassignment - needs a new dispatcher",
	resolved: "Mission resolved",
};

const UPDATE_TYPE_LABELS: Record<string, string> = {
	note: "Note",
	photo: "Photo",
};

const OUTCOME_LABELS: Record<string, string> = {
	rescued_handed_to_spca: "Animal rescued - handed to SPCA",
	not_located: "Animal not located",
	unsuccessful: "Attempted rescue was unsuccessful",
	other: "Other",
};

// Generates the read-only, human-readable rescue summary the requirement
// asks for: assembled from the alert + assignment + timestamps + updates +
// outcome + debrief, so the dispatcher never has to re-type known data.
export function generateRescueSummary(
	report: RescueReportRow,
	progress: RescueHistoryEntry[],
	updates: RescueMissionUpdateRow[],
	debrief: RescueDebriefRow | null,
): string {
	const lines: string[] = ["RESCUE MISSION SUMMARY"];
	lines.push(`Mission: ${report.reference}`);
	lines.push(`Status: ${STATUS_LABELS[report.status] ?? report.status}`);
	lines.push(`Urgency: ${report.urgency}`);
	lines.push(`Reported: ${formatTimestamp(report.createdAt)} by ${report.reporterName || "Anonymous"}`);
	if (report.location) {
		const coords =
			report.latitude != null && report.longitude != null
				? ` (${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)})`
				: "";
		lines.push(`Location: ${report.location}${coords}`);
	}
	const animal = [report.animalType, report.animalBreed].filter(Boolean).join(" - ");
	if (animal) lines.push(`Animal: ${animal}`);
	if (report.conditionDescription) lines.push(`Condition reported: ${report.conditionDescription}`);

	lines.push("");
	lines.push("Timeline:");
	for (const entry of progress) {
		const who = entry.dispatcherName ?? "Staff";
		lines.push(`- ${formatTimestamp(entry.createdAt)} - ${STATUS_LABELS[entry.toStatus] ?? entry.toStatus} - ${who}`);
		if (entry.notes) lines.push(`    ${entry.notes}`);
		if (entry.additionalRemarks) lines.push(`    ${entry.additionalRemarks}`);
	}

	if (updates.length) {
		lines.push("");
		lines.push("Mission updates:");
		for (const update of updates) {
			const who = update.dispatcherName ?? "Dispatcher";
			const detail = update.message ?? (update.imageUrls.length ? "Photo evidence attached" : "");
			lines.push(
				`- [${UPDATE_TYPE_LABELS[update.updateType] ?? update.updateType}] ${detail} - ${who}, ${formatTimestamp(update.createdAt)}`,
			);
		}
	}

	if (debrief) {
		lines.push("");
		lines.push("Post-rescue debrief:");
		lines.push(`Outcome: ${OUTCOME_LABELS[debrief.outcome] ?? debrief.outcome}`);
		if (debrief.animalCondition) lines.push(`Animal condition: ${debrief.animalCondition}`);
		lines.push(`What happened: ${debrief.whatHappened}`);
		if (debrief.destinationOrHandoff) lines.push(`Destination / handoff: ${debrief.destinationOrHandoff}`);
		if (debrief.veterinaryPriority) lines.push(`Veterinary priority at handoff: ${debrief.veterinaryPriority}`);
		if (debrief.unsuccessfulDetails) lines.push(`Unsuccessful details: ${debrief.unsuccessfulDetails}`);
	}

	return lines.join("\n");
}

// Attaches everything a Mission Board / Mission History row needs - the
// status timeline, the optional in-rescue updates, the debrief, the intake
// handoff - and a generated summary, all batched so no N+1 queries.
export async function attachMissionDetails(reports: RescueReportRow[]): Promise<RescueMission[]> {
	if (reports.length === 0) return [];
	const ids = reports.map((report) => report.id);
	const [history, updates, debriefs, handoffs] = await Promise.all([
		findStatusHistoryByReportIds(ids),
		findMissionUpdatesByReportIds(ids),
		findDebriefByReportIds(ids),
		findIntakeHandoffsByReportIds(ids),
	]);

	const grouped = new Map<string, RescueHistoryEntry[]>();
	for (const entry of history) {
		const list = grouped.get(entry.reportId) ?? [];
		list.push(entry);
		grouped.set(entry.reportId, list);
	}
	const updatesByReport = new Map<string, RescueMissionUpdateRow[]>();
	for (const update of updates) {
		const list = updatesByReport.get(update.reportId) ?? [];
		list.push(update);
		updatesByReport.set(update.reportId, list);
	}
	const debriefByReport = new Map(debriefs.map((debrief) => [debrief.reportId, debrief]));
	const handoffByReport = new Map(handoffs.map((handoff) => [handoff.reportId, handoff]));

	return reports.map((report) => {
		const normalized = normalizeRescueReport(report);
		const progress = grouped.get(report.id) ?? [];
		const missionUpdates = updatesByReport.get(report.id) ?? [];
		const debrief = debriefByReport.get(report.id) ?? null;
		const intakeHandoff = handoffByReport.get(report.id) ?? null;
		return {
			...normalized,
			progress,
			updates: missionUpdates,
			debrief,
			intakeHandoff,
			summary: generateRescueSummary(normalized, progress, missionUpdates, debrief),
		};
	});
}

// Shared ranking for the Mission Board and both Active Mission groups:
// Critical -> High -> Moderate -> Low, then oldest first within a band (oldest
// alert has waited longest). Unknown urgencies sink to the bottom. Never
// mutates the input array.
function sortMissionsByUrgency<T extends { urgency: string; createdAt: Date }>(missions: T[]): T[] {
	return [...missions].sort((a, b) => {
		const rankDiff = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
		if (rankDiff !== 0) return rankDiff;
		return a.createdAt.getTime() - b.createdAt.getTime();
	});
}

// The Mission Board: alerts still awaiting a dispatcher - fresh "submitted"
// rows and released/handed-over "awaiting_reassignment" rows, both with nobody
// assigned. Once accepted, the alert leaves the board immediately (it becomes
// the accepting dispatcher's Assigned or In Progress mission). The service
// re-checks both conditions so a mis-configured query can never leak an
// in-flight mission onto the Board.
export async function listMissionBoard(): Promise<RescueMission[]> {
	const available = await findAvailableReports();
	const unassigned = available.filter(
		(report) =>
			(report.status === "submitted" || report.status === "awaiting_reassignment") &&
			!report.assignedToClerkUserId,
	);
	return sortMissionsByUrgency(await attachMissionDetails(unassigned));
}

export type MyActiveMissions = {
	assigned: RescueMission[];
	inProgress: RescueMission[];
};

// A dispatcher's own active missions for the Active Mission workspace, already
// split into the two strictly-disjoint groups the UI tabs between: "Assigned"
// (accepted, not yet started) and "In Progress" (started, not yet resolved).
// Legacy "rescued" rows are normalized to "in_progress" before grouping.
export async function listMyActiveMissions(clerkUserId: string): Promise<MyActiveMissions> {
	const [assigned, inProgress] = await Promise.all([
		attachMissionDetails(await findAssignedReportsByDispatcher(clerkUserId)),
		attachMissionDetails(await findInProgressReportsByDispatcher(clerkUserId)),
	]);
	return {
		assigned: sortMissionsByUrgency(assigned),
		inProgress: sortMissionsByUrgency(inProgress),
	};
}

// Mission History: resolved missions only, ranked by urgency like every other
// tab (Critical -> High -> Moderate -> Low), newest first within a band since
// history reads as a log. The raw-status filter is belt-and-suspenders on top
// of the repository's "resolved" query.
export async function listMissionHistory(): Promise<RescueMission[]> {
	const resolved = (await findResolvedReports()).filter((report) => report.status === "resolved");
	const missions = await attachMissionDetails(resolved);
	return [...missions].sort((a, b) => {
		const rankDiff = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
		if (rankDiff !== 0) return rankDiff;
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});
}

// Full detail for one mission, used by the Mission Board panel, the Active
// Mission workspace, and the Mission History drill-down.
export async function getRescueMissionById(id: string): Promise<RescueMission | undefined> {
	const report = await findReportById(id);
	if (!report) return undefined;
	return (await attachMissionDetails([report]))[0];
}

// Accept Mission: the same guarded single-assignment as the legacy claim -
// two dispatchers clicking Accept together never both win because the
// repository UPDATE is conditional on the row still being unassigned. Works
// for fresh "submitted" alerts AND for released/handed-over alerts that are
// sitting on the board as "awaiting_reassignment". A handed-over mission
// resumes at In Progress (the rescue work continues, updates preserved); a
// released one restarts at Assigned.
export async function acceptRescueMission(
	id: string,
	dispatcherClerkUserId: string,
	dispatcherName: string,
): Promise<RescueMission | undefined> {
	const current = await findReportById(id);
	if (!current) return undefined;
	if (current.status !== "submitted" && current.status !== "awaiting_reassignment") {
		throw new RescueWorkflowError("This rescue alert has already been accepted.", 409);
	}
	if (current.assignedToClerkUserId) {
		throw new RescueWorkflowError("This rescue alert has already been accepted.", 409);
	}

	// For a reassignment, the previous status in the timeline tells us how to
	// resume: a handed-over mission (previously in_progress) continues at In
	// Progress so the work already done stays a single mission, while a
	// released mission (previously assigned, never started) restarts fresh.
	let nextStatus: "assigned" | "in_progress" = "assigned";
	let notes = "Dispatcher accepted this mission.";
	if (current.status === "awaiting_reassignment") {
		const history = await getProgressForReport(id);
		const last = history[history.length - 1];
		if (last?.fromStatus === "in_progress") {
			nextStatus = "in_progress";
			notes = "Dispatcher accepted the handover and is continuing the rescue.";
		} else {
			notes = "Dispatcher accepted this alert after it was released.";
		}
	}

	const updated = await applyProgressTransition({
		reportId: id,
		fromStatus: current.status,
		toStatus: nextStatus,
		actorClerkUserId: dispatcherClerkUserId,
		dispatcherName,
		notes,
		imageUrls: [],
		mutate: () =>
			current.status === "awaiting_reassignment"
				? reassignUnassignedRescueReport(id, dispatcherClerkUserId, dispatcherName, nextStatus)
				: claimRescueReportInRepository(id, dispatcherClerkUserId, dispatcherName),
	});

	await logAuditEntry({
		actorClerkUserId: dispatcherClerkUserId,
		action: "rescue.mission.accepted",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: {
			reference: updated.reference,
			fromStatus: current.status,
			toStatus: updated.status,
			assignedTo: updated.assignedTo,
		},
	});

	return (await attachMissionDetails([updated]))[0];
}

// Start Mission: assigned -> In Progress. A dispatcher en route must never be
// blocked at a form, so no note is required - actions speak; optional notes /
// evidence images ride on the timeline entry if the dispatcher chooses to add
// them while still at the station.
export async function startRescueMission(
	id: string,
	actorClerkUserId: string,
	dispatcherName: string,
	input: { notes?: string; imageUrls?: string[] } = {},
): Promise<RescueMission | undefined> {
	const report = await findReportById(id);
	if (!report) return undefined;
	assertAssignedDispatcher(report, actorClerkUserId);
	throwIfInvalidTransition(report.status, "in_progress");

	const updated = await applyProgressTransition({
		reportId: id,
		fromStatus: report.status,
		toStatus: "in_progress",
		actorClerkUserId,
		dispatcherName,
		notes: input.notes?.trim() || "Rescue started.",
		imageUrls: input.imageUrls ?? [],
		mutate: () => updateRescueReportStatusConditional(id, actorClerkUserId, "in_progress", "assigned"),
	});

	await logAuditEntry({
		actorClerkUserId,
		action: "rescue.mission.started",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: { reference: updated.reference, fromStatus: report.status, toStatus: updated.status },
	});

	return (await attachMissionDetails([updated]))[0];
}

// Release Mission (Assigned) / Request Handover (In Progress): the assigned
// dispatcher gives the alert up - too far away, too busy, or unable to
// continue. The alert is cleared back to the Mission Board as
// "awaiting_reassignment" for another dispatcher to accept. A short reason is
// required and lands on the timeline (who released it, when, why). A
// handed-over mission keeps every update already filed - none of its rescue
// history is a new mission, just reassigned.
export async function releaseRescueMission(
	id: string,
	actorClerkUserId: string,
	dispatcherName: string,
	input: { reason: string },
): Promise<RescueMission | undefined> {
	const report = await findReportById(id);
	if (!report) return undefined;
	assertAssignedDispatcher(report, actorClerkUserId);
	if (report.status !== "assigned" && report.status !== "in_progress") {
		throw new RescueWorkflowError("Only an Assigned or In Progress rescue alert can be released.", 409);
	}
	const reason = input.reason?.trim() ?? "";
	if (!reason) {
		throw new RescueWorkflowError("A short reason is required before releasing the alert.", 400);
	}

	const handover = report.status === "in_progress";
	const updated = await applyProgressTransition({
		reportId: id,
		fromStatus: report.status,
		toStatus: "awaiting_reassignment",
		actorClerkUserId,
		dispatcherName,
		notes: reason,
		imageUrls: [],
		mutate: () => releaseRescueReportAssignment(id, actorClerkUserId, report.status as "assigned" | "in_progress"),
	});

	await logAuditEntry({
		actorClerkUserId,
		action: handover ? "rescue.mission.handover_requested" : "rescue.mission.released",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: { reference: updated.reference, fromStatus: report.status, toStatus: updated.status, reason },
	});

	return (await attachMissionDetails([updated]))[0];
}

// Quick update while a rescue is in progress: a note or a photo. Timestamped
// automatically, never changes the mission status, and never demands a form.
// Only the assigned dispatcher and only while the mission is really in
// progress.
export async function addRescueUpdate(
	id: string,
	actorClerkUserId: string,
	dispatcherName: string,
	input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] },
): Promise<{ update: RescueMissionUpdateRow; mission: RescueMission } | undefined> {
	const report = await findReportById(id);
	if (!report) return undefined;
	assertAssignedDispatcher(report, actorClerkUserId);
	if (report.status !== "in_progress") {
		throw new RescueWorkflowError("Mission updates can only be added while the rescue is in progress.", 409);
	}
	if (!RESCUE_UPDATE_TYPES.includes(input.updateType)) {
		throw new RescueWorkflowError("Unknown mission update type.", 400);
	}

	const message = input.message?.trim() ?? null;
	if (input.updateType === "note" && !message) {
		throw new RescueWorkflowError("A note update needs a short message.", 400);
	}
	if (input.updateType === "photo" && (input.imageUrls ?? []).length === 0 && !message) {
		throw new RescueWorkflowError("A photo update needs at least one image.", 400);
	}

	const update = await addRescueMissionUpdate({
		reportId: id,
		updateType: input.updateType,
		message,
		imageUrls: input.imageUrls ?? [],
		createdByClerkUserId: actorClerkUserId,
		dispatcherName,
	});

	const mission = (await attachMissionDetails([report]))[0];
	return { update, mission };
}

// Post-Rescue Debrief: the single concise debrief that completes a mission
// (in_progress -> resolved). Everything - the timeline milestone, the debrief
// row, the guarded status change, and (for rescued animals) the intake
// handoff - is written in the same history-first order as the other dispatcher
// actions, with compensating deletes so no half-written state survives a race.
export async function completeRescueDebrief(
	id: string,
	actorClerkUserId: string,
	dispatcherName: string,
	input: {
		outcome: RescueOutcome;
		whatHappened: string;
		animalCondition?: string;
		veterinaryPriority?: string;
		unsuccessfulDetails?: string;
		imageUrls?: string[];
	},
): Promise<RescueMission | undefined> {
	const report = await findReportById(id);
	if (!report) return undefined;
	assertAssignedDispatcher(report, actorClerkUserId);
	throwIfInvalidTransition(report.status, "resolved");

	const whatHappened = input.whatHappened?.trim() ?? "";
	if (!whatHappened) {
		throw new RescueWorkflowError("Tell us what happened during the rescue to complete the debrief.", 400);
	}
	const rescued = (RESCUE_SUCCESS_OUTCOMES as readonly string[]).includes(input.outcome);
	if (rescued && !input.veterinaryPriority?.trim()) {
		throw new RescueWorkflowError("Veterinary priority is required so the intake team can triage.", 400);
	}
	if (input.outcome === "other" && !input.unsuccessfulDetails?.trim()) {
		throw new RescueWorkflowError('Please explain the "Other" outcome in the unsuccessful details.', 400);
	}

	// 1. The resolved timeline milestone, written first so a later failure can
	// never leave the mission resolved without a record.
	let historyEntry: RescueHistoryEntry;
	try {
		historyEntry = await addRescueStatusHistoryEntry({
			reportId: id,
			fromStatus: report.status,
			toStatus: "resolved",
			changedByClerkUserId: actorClerkUserId,
			dispatcherName,
			notes: whatHappened,
			outcome: input.outcome,
			additionalRemarks: input.veterinaryPriority?.trim()
				? `Veterinary priority: ${input.veterinaryPriority.trim()}`
				: input.unsuccessfulDetails?.trim() || undefined,
			imageUrls: input.imageUrls ?? [],
		});
	} catch {
		throw new RescueWorkflowError("The debrief could not be saved - the mission status was not changed.", 500);
	}

	// 2. The debrief row itself.
	let debrief: RescueDebriefRow;
	try {
		debrief = await addRescueDebrief({
			reportId: id,
			outcome: input.outcome,
			animalCondition: input.animalCondition?.trim() || null,
			whatHappened,
			destinationOrHandoff: null,
			veterinaryPriority: input.veterinaryPriority?.trim() || null,
			unsuccessfulDetails: input.unsuccessfulDetails?.trim() || null,
			createdByClerkUserId: actorClerkUserId,
			dispatcherName,
		});
	} catch {
		await deleteStatusHistoryEntry(historyEntry.id).catch(() => undefined);
		throw new RescueWorkflowError("The debrief could not be saved - the mission status was not changed.", 500);
	}

	// 3. The guarded status change - the database-level lock against a stale
	// client or a duplicate debrief.
	const updated = await updateRescueReportStatusConditional(id, actorClerkUserId, "resolved", "in_progress");
	if (!updated) {
		await deleteStatusHistoryEntry(historyEntry.id).catch(() => undefined);
		await deleteRescueDebrief(debrief.id).catch(() => undefined);
		throw new RescueWorkflowError(
			"This rescue mission has changed since it was loaded - please refresh and try again.",
			409,
		);
	}

	// 4. Animal Intake handoff for rescued outcomes only. Unique on report_id
	// (onConflictDoNothing) so even a retried or racing request can never
	// create two handoffs for the same animal.
	let intakeHandoff: RescueIntakeHandoffRow | null = null;
	if (rescued) {
		const created = await createRescueIntakeHandoff({
			reportId: id,
			animalType: report.animalType,
			animalBreed: report.animalBreed,
			conditionDescription: report.conditionDescription,
			veterinaryPriority: input.veterinaryPriority?.trim() || null,
			destination: "SPCA Fiji",
			notes: whatHappened,
			createdByClerkUserId: actorClerkUserId,
			dispatcherName,
		});
		intakeHandoff = created ?? (await findIntakeHandoffByReportId(id)) ?? null;
	}

	await logAuditEntry({
		actorClerkUserId,
		action: "rescue.mission.resolved",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: { reference: updated.reference, outcome: input.outcome, intakeHandoff: Boolean(intakeHandoff) },
	});

	const withDetails = await attachMissionDetails([updated]);
	return withDetails[0];
}

// ---- Animal Intake handoffs ----

// The open intake queue for the Intake & Profile team: every rescued animal
// awaiting intake, with its original alert attached for context.
export async function listIntakeHandoffs() {
	const handoffs = await findPendingIntakeHandoffs();
	if (handoffs.length === 0) return [];
	const reports = await findReportsByIds(handoffs.map((handoff) => handoff.reportId));
	const byId = new Map(reports.map((report) => [report.id, report]));
	return handoffs.map((handoff) => ({ ...handoff, report: byId.get(handoff.reportId) ?? null }));
}

export async function markIntakeHandoffReceived(id: string, actorClerkUserId: string) {
	const handoff = await findIntakeHandoffById(id);
	if (!handoff) return undefined;
	const [report] = await findReportsByIds([handoff.reportId]);
	const updated =
		handoff.status === "received" ? handoff : await markIntakeHandoffReceivedInRepository(id, new Date());

	await logAuditEntry({
		actorClerkUserId,
		action: "rescue.intake.received",
		entityType: "rescue_intake_handoff",
		entityId: updated.id,
		metadata: { reference: report?.reference },
	});

	return { ...updated, report: report ?? null };
}

export async function listRescueReports() {
	return normalizeRescueReports(await attachProgress(await findAllReports()));
}

// The dispatcher tabs each filter twice: the repository WHERE clause does the
// real work, and these belt-and-suspenders checks re-assert the tab invariants
// at the service boundary so an In Progress case can never surface under
// Available (or a resolved one under Assigned) even if a future query drifts.
export async function listAvailableRescueReports() {
	const available = await findAvailableReports();
	const eligible = available.filter(
		(report) =>
			(report.status === "submitted" || report.status === "awaiting_reassignment") &&
			!report.assignedToClerkUserId,
	);
	return normalizeRescueReports(await attachProgress(eligible));
}

export async function listMyAssignedRescueReports(clerkUserId: string) {
	const assigned = await findActiveReportsByDispatcher(clerkUserId);
	const active = assigned.filter(
		(report) => report.assignedToClerkUserId === clerkUserId && report.status !== "resolved",
	);
	return normalizeRescueReports(await attachProgress(active));
}

export async function listMyResolvedRescueReports(clerkUserId: string) {
	const resolved = await findResolvedReportsByDispatcher(clerkUserId);
	const mine = resolved.filter(
		(report) => report.assignedToClerkUserId === clerkUserId && report.status === "resolved",
	);
	return normalizeRescueReports(await attachProgress(mine));
}

export async function getRescueReportById(id: string) {
	const report = await findReportById(id);
	if (!report) return report;
	const [withProgress] = await attachProgress([report]);
	return withProgress ? normalizeRescueReport(withProgress) : report;
}

export async function listMyRescueReports(clerkUserId: string) {
	return normalizeRescueReports(await attachProgress(await findReportsByReporter(clerkUserId)));
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

export async function claimRescueReport(id: string, dispatcherClerkUserId: string, dispatcherName: string) {
	const current = await findReportById(id);
	if (!current) return undefined;
	if (current.status !== "submitted") {
		throw new RescueWorkflowError("This rescue case has already been taken by another dispatcher.", 409);
	}

	// Progress row is saved first; the guarded claim below then atomically
	// assigns the dispatcher. If the claim loses the race, the orphaned entry
	// is removed - and if the progress write itself fails, the status never
	// changes at all (see startRescueReport for the same ordering).
	const updated = await applyProgressTransition({
		reportId: id,
		fromStatus: current.status,
		toStatus: "assigned",
		actorClerkUserId: dispatcherClerkUserId,
		dispatcherName,
		notes: "Dispatcher claimed this case.",
		imageUrls: [],
		mutate: () => claimRescueReportInRepository(id, dispatcherClerkUserId, dispatcherName),
	});

	await logAuditEntry({
		actorClerkUserId: dispatcherClerkUserId,
		action: "rescue.report.claimed",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: { reference: updated.reference, assignedTo: updated.assignedTo },
	});

	return { ...updated, progress: await getProgressForReport(updated.id) };
}

// Start Rescue: an assigned case moves to In Progress with a required action
// plan / progress notes and optional evidence images.
export async function startRescueReport(
	id: string,
	actorClerkUserId: string,
	dispatcherName: string,
	input: { notes: string; imageUrls: string[] },
) {
	const report = await findReportById(id);
	if (!report) return undefined;
	assertAssignedDispatcher(report, actorClerkUserId);
	throwIfInvalidTransition(report.status, "in_progress");
	if (!input.notes || !input.notes.trim()) {
		throw new RescueWorkflowError("Progress notes are required before the rescue can start.", 400);
	}

	const updated = await applyProgressTransition({
		reportId: id,
		fromStatus: report.status,
		toStatus: "in_progress",
		actorClerkUserId,
		dispatcherName,
		notes: input.notes.trim(),
		imageUrls: input.imageUrls ?? [],
		mutate: () => updateRescueReportStatusConditional(id, actorClerkUserId, "in_progress", "assigned"),
	});

	await logAuditEntry({
		actorClerkUserId,
		action: "rescue.report.started",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: { reference: updated.reference, fromStatus: report.status, toStatus: updated.status },
	});

	return { ...updated, progress: await getProgressForReport(updated.id) };
}

// Complete Rescue: an In Progress case moves to Resolved only when the
// dispatcher submits a final report, an outcome, and (when "other") an
// explanation. Everything is saved together or not at all.
export async function resolveRescueReport(
	id: string,
	actorClerkUserId: string,
	dispatcherName: string,
	input: { notes: string; outcome: RescueOutcome; additionalRemarks?: string; imageUrls: string[] },
) {
	const report = await findReportById(id);
	if (!report) return undefined;
	assertAssignedDispatcher(report, actorClerkUserId);
	throwIfInvalidTransition(report.status, "resolved");

	const notes = input.notes?.trim() ?? "";
	if (!notes) {
		throw new RescueWorkflowError("A final rescue report is required before this case can be resolved.", 400);
	}
	if (!input.outcome) {
		throw new RescueWorkflowError("A rescue outcome is required before this case can be resolved.", 400);
	}
	if (input.outcome === "other" && !(input.additionalRemarks?.trim() ?? "")) {
		throw new RescueWorkflowError('Please explain the "Other" outcome in the additional remarks.', 400);
	}

	const updated = await applyProgressTransition({
		reportId: id,
		fromStatus: report.status,
		toStatus: "resolved",
		actorClerkUserId,
		dispatcherName,
		notes,
		outcome: input.outcome,
		additionalRemarks: input.additionalRemarks?.trim() || undefined,
		imageUrls: input.imageUrls ?? [],
		mutate: () => updateRescueReportStatusConditional(id, actorClerkUserId, "resolved", "in_progress"),
	});

	await logAuditEntry({
		actorClerkUserId,
		action: "rescue.report.resolved",
		entityType: "rescue_report",
		entityId: updated.id,
		metadata: {
			reference: updated.reference,
			fromStatus: report.status,
			toStatus: updated.status,
			outcome: input.outcome,
		},
	});

	return { ...updated, progress: await getProgressForReport(updated.id) };
}

// Only the dispatcher who owns the case may move it forward.
function assertAssignedDispatcher(report: RescueReportRow, actorClerkUserId: string) {
	if (report.assignedToClerkUserId !== actorClerkUserId) {
		throw new RescueWorkflowError("Only the assigned dispatcher can update this rescue case.", 403);
	}
}

// The shared write path used by every dispatcher action. The progress/history
// row is written BEFORE the guarded status update:
//   1. If the progress write fails, the status is never touched.
//   2. The guarded update is the database-level lock - if another dispatcher
//      (or a stale client) won the race, the update returns no row and the
//      orphaned progress entry is deleted.
// This satisfies "do not change status if saving the progress update fails"
// without a multi-statement DB transaction (the stateless neon-http driver
// has none), using the conditional UPDATE itself as the atomicity boundary.
async function applyProgressTransition(input: {
	reportId: string;
	fromStatus: string;
	toStatus: string;
	actorClerkUserId: string;
	dispatcherName: string;
	notes: string;
	outcome?: string;
	additionalRemarks?: string;
	imageUrls?: string[];
	mutate: () => Promise<RescueReportRow | undefined>;
}) {
	let historyEntry: RescueHistoryEntry;
	try {
		historyEntry = await addRescueStatusHistoryEntry({
			reportId: input.reportId,
			fromStatus: input.fromStatus,
			toStatus: input.toStatus,
			changedByClerkUserId: input.actorClerkUserId,
			dispatcherName: input.dispatcherName,
			notes: input.notes,
			outcome: input.outcome,
			additionalRemarks: input.additionalRemarks,
			imageUrls: input.imageUrls ?? [],
		});
	} catch {
		throw new RescueWorkflowError(
			"Your progress report could not be saved - the rescue case status was not changed.",
			500,
		);
	}

	const updated = await input.mutate();
	if (!updated) {
		// Someone else claimed/updated the case in the meantime; drop the
		// orphaned progress row so the report state stays consistent.
		await deleteStatusHistoryEntry(historyEntry.id).catch(() => undefined);
		throw new RescueWorkflowError(
			"This rescue case has changed since it was loaded - please refresh and try again.",
			409,
		);
	}
	return updated;
}

// Reports move forward through the lifecycle one step at a time. "resolved"
// is a terminal state. Any other change (staying put, going backwards,
// skipping a step) is rejected so the queue can't be corrupted by an
// accidental reorder and resolved cases can never be re-opened. Releasing /
// handing over is a deliberate step OFF the chain into "awaiting_reassignment"
// (validated in releaseRescueMission) and back onto it via acceptRescueMission,
// so it is handled explicitly and never counted as a forward step here.
function throwIfInvalidTransition(from: string, to: RescueReportStatus) {
	const fromIndex = RESCUE_FORWARD_CHAIN.indexOf(from as (typeof RESCUE_FORWARD_CHAIN)[number]);
	const toIndex = RESCUE_FORWARD_CHAIN.indexOf(to as (typeof RESCUE_FORWARD_CHAIN)[number]);
	const isForward = fromIndex !== -1 && toIndex === fromIndex + 1;

	if (!isForward) {
		throw new RescueWorkflowError(
			`Rescue report cannot move from "${from}" to "${to}" - status changes must move forward through ${RESCUE_REPORT_STATUSES.join(" -> ")}.`,
			409,
		);
	}
}

// Streams an uploaded photo buffer straight to Cloudinary (never touching
// disk) and returns its hosted URL - the same pattern as animal photos. The
// `folder` argument keeps reporter photos ("ara/rescue") separate from
// dispatcher progress images ("ara/rescue-progress").
export async function uploadRescuePhoto(fileBuffer: Buffer, folder = "ara/rescue"): Promise<string> {
	if (!isCloudinaryConfigured()) {
		throw new Error(
			"Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before uploading photos.",
		);
	}

	return new Promise<string>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
			if (error || !result) {
				reject(error ?? new Error("Cloudinary upload failed"));
				return;
			}
			resolve(result.secure_url);
		});
		stream.end(fileBuffer);
	});
}

export const normalizeLegacyRescueStatus = (status: string): string =>
	status === "rescued" ? "in_progress" : status === "closed" ? "resolved" : status;

function normalizeRescueReport<T extends { status: string }>(report: T): T {
	return { ...report, status: normalizeLegacyRescueStatus(report.status) };
}

function normalizeRescueReports<T extends { status: string }>(reports: T[]): T[] {
	return reports.map(normalizeRescueReport);
}