import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
	rescueDebriefs,
	rescueIntakeHandoffs,
	rescueMissionUpdates,
	rescueReports,
	rescueReportStatusHistory,
} from "../../db/schema.js";

// Newest reports first so the staff dispatch queue always shows the latest
// intake at the top instead of burying it under older cases.
export async function findAllReports() {
	return db.select().from(rescueReports).orderBy(desc(rescueReports.createdAt));
}

// Reports for a batch of ids - used to attach an original alert (reference,
// location, animal info) onto intake handoffs without an N+1.
export async function findReportsByIds(ids: string[]) {
	if (ids.length === 0) return [];
	return db.select().from(rescueReports).where(inArray(rescueReports.id, ids));
}

// Every mission that has not been resolved yet - the Mission Board's raw
// material. Ranking Critical -> High -> Moderate -> Low happens in the
// service layer, so this stays a plain status filter here.
export async function findActiveReports() {
	return db
		.select()
		.from(rescueReports)
		.where(inArray(rescueReports.status, ["submitted", "assigned", "in_progress"]))
		.orderBy(desc(rescueReports.createdAt));
}

// Resolved missions, most recent first, for the Mission History view.
export async function findResolvedReports() {
	return db
		.select()
		.from(rescueReports)
		.where(eq(rescueReports.status, "resolved"))
		.orderBy(desc(rescueReports.createdAt));
}

// Cases a dispatcher may still claim: never assigned to anyone and awaiting a
// dispatcher. That covers fresh "submitted" alerts and alerts that have been
// released/handed over ("awaiting_reassignment"). The partial index
// rescue_reports_available_idx backs this query.
export async function findAvailableReports() {
	return db
		.select()
		.from(rescueReports)
		.where(
			and(
				isNull(rescueReports.assignedToClerkUserId),
				inArray(rescueReports.status, ["submitted", "awaiting_reassignment"]),
			),
		)
		.orderBy(desc(rescueReports.createdAt));
}

// Everything currently assigned to one dispatcher that is still being worked
// on. Resolved cases have their own query so the tabs stay strictly separate.
export async function findActiveReportsByDispatcher(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(
			and(
				eq(rescueReports.assignedToClerkUserId, clerkUserId),
				inArray(rescueReports.status, ["assigned", "in_progress"]),
			),
		)
		.orderBy(desc(rescueReports.createdAt));
}

// Accepted but not yet started missions for one dispatcher - the "Assigned"
// group of the Active Mission workspace. The status AND the dispatcher are
// pinned in the query so this group can never overlap with "In Progress".
export async function findAssignedReportsByDispatcher(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(
			and(
				eq(rescueReports.assignedToClerkUserId, clerkUserId),
				eq(rescueReports.status, "assigned"),
			),
		)
		.orderBy(desc(rescueReports.createdAt));
}

// Missions a dispatcher has started but not yet resolved - the "In Progress"
// group of the Active Mission workspace.
export async function findInProgressReportsByDispatcher(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(
			and(
				eq(rescueReports.assignedToClerkUserId, clerkUserId),
				eq(rescueReports.status, "in_progress"),
			),
		)
		.orderBy(desc(rescueReports.createdAt));
}

export async function findResolvedReportsByDispatcher(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(
			and(
				eq(rescueReports.assignedToClerkUserId, clerkUserId),
				eq(rescueReports.status, "resolved"),
			),
		)
		.orderBy(desc(rescueReports.createdAt));
}

// Every report belonging to one signed-in reporter, for their dashboard.
export async function findReportsByReporter(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(eq(rescueReports.reporterClerkUserId, clerkUserId))
		.orderBy(desc(rescueReports.createdAt));
}

export async function findReportById(id: string) {
	const [report] = await db.select().from(rescueReports).where(eq(rescueReports.id, id));
	return report;
}

// Public tracking lookup by the reference code given to the reporter.
export async function findReportByReference(reference: string) {
	const [report] = await db
		.select()
		.from(rescueReports)
		.where(eq(rescueReports.reference, reference));
	return report;
}

export async function createRescueReport(input: typeof rescueReports.$inferInsert) {
	const [report] = await db.insert(rescueReports).values(input).returning();
	return report;
}

// Updates only the fields provided in `input` and always refreshes updatedAt.
export async function updateRescueReport(id: string, input: Partial<typeof rescueReports.$inferInsert>) {
	const [report] = await db
		.update(rescueReports)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(rescueReports.id, id))
		.returning();
	return report;
}

// The assignment and status change are one conditional SQL UPDATE. A second
// dispatcher receives no row when another claim won the race.
export async function claimRescueReport(
	id: string,
	dispatcherClerkUserId: string,
	dispatcherName: string,
) {
	const [report] = await db
		.update(rescueReports)
		.set({
			assignedTo: dispatcherName,
			assignedToClerkUserId: dispatcherClerkUserId,
			assignedAt: new Date(),
			status: "assigned",
			updatedAt: new Date(),
		})
		.where(and(eq(rescueReports.id, id), isNull(rescueReports.assignedToClerkUserId)))
		.returning();
	return report;
}

// Release Mission / Request Handover: the assigned dispatcher gives the alert
// up. One guarded UPDATE clears the assignment AND moves the alert to
// "awaiting_reassignment" so it returns to the Mission Board. The WHERE pins
// the current dispatcher AND the expected stage, so only the true owner of an
// Assigned or In Progress alert can release it and a stale request can never
// unassign someone else's rescue.
export async function releaseRescueReportAssignment(
	id: string,
	dispatcherClerkUserId: string,
	expectedStatus: "assigned" | "in_progress",
) {
	const [report] = await db
		.update(rescueReports)
		.set({
			status: "awaiting_reassignment",
			assignedTo: null,
			assignedToClerkUserId: null,
			assignedAt: null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(rescueReports.id, id),
				eq(rescueReports.assignedToClerkUserId, dispatcherClerkUserId),
				eq(rescueReports.status, expectedStatus),
			),
		)
		.returning();
	return report;
}

// Accepts a released/handed-over alert from the Mission Board. Guarded the same
// way as claimRescueReport - the row must still be unassigned AND in the
// "awaiting_reassignment" state, so two dispatchers accepting the same alert
// together can never both win. nextStatus resumes a handed-over mission at
// In Progress (the work continues) and a released mission at Assigned.
export async function reassignUnassignedRescueReport(
	id: string,
	dispatcherClerkUserId: string,
	dispatcherName: string,
	nextStatus: "assigned" | "in_progress",
) {
	const [report] = await db
		.update(rescueReports)
		.set({
			status: nextStatus,
			assignedTo: dispatcherName,
			assignedToClerkUserId: dispatcherClerkUserId,
			assignedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(rescueReports.id, id),
				isNull(rescueReports.assignedToClerkUserId),
				eq(rescueReports.status, "awaiting_reassignment"),
			),
		)
		.returning();
	return report;
}

// Conditional single-row status update used by the dispatcher workflow. The
// WHERE clause pins the expected current status AND the assigned dispatcher,
// so a second update (wrong dispatcher, stale status, already resolved) never
// touches the row - it just returns no report.
export async function updateRescueReportStatusConditional(
	id: string,
	dispatcherClerkUserId: string,
	nextStatus: "in_progress" | "resolved",
	expectedStatus: "assigned" | "in_progress",
) {
	const [report] = await db
		.update(rescueReports)
		.set({ status: nextStatus, updatedAt: new Date() })
		.where(
			and(
				eq(rescueReports.id, id),
				eq(rescueReports.assignedToClerkUserId, dispatcherClerkUserId),
				eq(rescueReports.status, expectedStatus),
			),
		)
		.returning();
	return report;
}

// Reverses an `updateRescueReportStatusConditional` so a failed progress-save
// can never leave the report with a changed status. Also conditional - only
// reverts if nothing else has moved the row since.
export async function revertRescueReportStatus(
	id: string,
	dispatcherClerkUserId: string,
	statusToRevert: "in_progress" | "resolved",
	revertToStatus: "assigned" | "in_progress",
) {
	const [report] = await db
		.update(rescueReports)
		.set({ status: revertToStatus, updatedAt: new Date() })
		.where(
			and(
				eq(rescueReports.id, id),
				eq(rescueReports.assignedToClerkUserId, dispatcherClerkUserId),
				eq(rescueReports.status, statusToRevert),
			),
		)
		.returning();
	return report;
}

// Removes an orphaned history entry when a concurrent claim/update wins the
// race after this transaction had already written its progress row.
export async function deleteStatusHistoryEntry(id: string) {
	await db.delete(rescueReportStatusHistory).where(eq(rescueReportStatusHistory.id, id));
}

export async function addRescueStatusHistoryEntry(
	input: typeof rescueReportStatusHistory.$inferInsert,
) {
	const [entry] = await db.insert(rescueReportStatusHistory).values(input).returning();
	return entry;
}

// The full progress timeline for a set of reports, earliest first. Grouped in
// the service layer so list responses can attach it without N queries.
export async function findStatusHistoryByReportIds(reportIds: string[]) {
	if (reportIds.length === 0) return [];
	return db
		.select()
		.from(rescueReportStatusHistory)
		.where(inArray(rescueReportStatusHistory.reportId, reportIds))
		.orderBy(rescueReportStatusHistory.createdAt);
}

// ---- Rescue Mission workflow (quick updates, debrief, intake handoff) ----

export async function addRescueMissionUpdate(input: typeof rescueMissionUpdates.$inferInsert) {
	const [update] = await db.insert(rescueMissionUpdates).values(input).returning();
	return update;
}

export async function deleteRescueMissionUpdate(id: string) {
	await db.delete(rescueMissionUpdates).where(eq(rescueMissionUpdates.id, id));
}

export async function findMissionUpdatesByReportIds(reportIds: string[]) {
	if (reportIds.length === 0) return [];
	return db
		.select()
		.from(rescueMissionUpdates)
		.where(inArray(rescueMissionUpdates.reportId, reportIds))
		.orderBy(rescueMissionUpdates.createdAt);
}

export async function addRescueDebrief(input: typeof rescueDebriefs.$inferInsert) {
	const [debrief] = await db.insert(rescueDebriefs).values(input).returning();
	return debrief;
}

// Removes an orphaned debrief when a concurrent completion wins the race but
// our status update lost it - keeps the "exactly one debrief" invariant.
export async function deleteRescueDebrief(id: string) {
	await db.delete(rescueDebriefs).where(eq(rescueDebriefs.id, id));
}

export async function findDebriefByReportIds(reportIds: string[]) {
	if (reportIds.length === 0) return [];
	return db.select().from(rescueDebriefs).where(inArray(rescueDebriefs.reportId, reportIds));
}

// onConflictDoNothing keeps the "one handoff per rescued animal" promise even
// if a retry or a concurrent debrief lands twice - the service falls back to
// the existing row via findIntakeHandoffByReportId.
export async function createRescueIntakeHandoff(input: typeof rescueIntakeHandoffs.$inferInsert) {
	const [handoff] = await db
		.insert(rescueIntakeHandoffs)
		.values(input)
		.onConflictDoNothing()
		.returning();
	return handoff;
}

export async function findIntakeHandoffByReportId(reportId: string) {
	const [handoff] = await db
		.select()
		.from(rescueIntakeHandoffs)
		.where(eq(rescueIntakeHandoffs.reportId, reportId));
	return handoff;
}

export async function findIntakeHandoffsByReportIds(reportIds: string[]) {
	if (reportIds.length === 0) return [];
	return db
		.select()
		.from(rescueIntakeHandoffs)
		.where(inArray(rescueIntakeHandoffs.reportId, reportIds));
}

// The Animal Intake queue: open handoffs, most recent first.
export async function findPendingIntakeHandoffs() {
	return db
		.select()
		.from(rescueIntakeHandoffs)
		.where(eq(rescueIntakeHandoffs.status, "pending"))
		.orderBy(desc(rescueIntakeHandoffs.createdAt));
}

export async function findIntakeHandoffById(id: string) {
	const [handoff] = await db.select().from(rescueIntakeHandoffs).where(eq(rescueIntakeHandoffs.id, id));
	return handoff;
}

export async function markIntakeHandoffReceived(id: string, receivedAt: Date) {
	const [handoff] = await db
		.update(rescueIntakeHandoffs)
		.set({ status: "received", receivedAt })
		.where(eq(rescueIntakeHandoffs.id, id))
		.returning();
	return handoff;
}