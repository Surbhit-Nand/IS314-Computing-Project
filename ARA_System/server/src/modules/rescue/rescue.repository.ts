import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
	rescueDebriefs,
	rescueIntakeHandoffs,
	rescueMissionUpdates,
	rescueReports,
	rescueReportStatusHistory,
	rescueTakeoverRequests,
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
		.where(
			inArray(rescueReports.status, ["submitted", "assigned", "in_progress", "awaiting_reassignment"]),
		)
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

// ---- Mission takeover requests ----

export async function createTakeoverRequest(input: typeof rescueTakeoverRequests.$inferInsert) {
	const [request] = await db.insert(rescueTakeoverRequests).values(input).returning();
	return request;
}

export async function findTakeoverRequestById(id: string) {
	const [request] = await db
		.select()
		.from(rescueTakeoverRequests)
		.where(eq(rescueTakeoverRequests.id, id));
	return request;
}

// Every pending request on a set of reports - attached to the owner's list so
// the UI can badge "Takeover Requested" and offer Approve/Decline.
export async function findPendingTakeoversByReportIds(reportIds: string[]) {
	if (reportIds.length === 0) return [];
	return db
		.select()
		.from(rescueTakeoverRequests)
		.where(
			and(
				inArray(rescueTakeoverRequests.reportId, reportIds),
				eq(rescueTakeoverRequests.status, "pending"),
			),
		)
		.orderBy(desc(rescueTakeoverRequests.createdAt));
}

// The pending requests one dispatcher has already made across the given
// reports - drives the "Request Pending" indicator + Withdraw action on the
// "Assigned to Others" list.
export async function findPendingTakeoversByRequester(
	reportIds: string[],
	requesterClerkUserId: string,
) {
	if (reportIds.length === 0) return [];
	return db
		.select()
		.from(rescueTakeoverRequests)
		.where(
			and(
				inArray(rescueTakeoverRequests.reportId, reportIds),
				eq(rescueTakeoverRequests.requestedByClerkUserId, requesterClerkUserId),
				eq(rescueTakeoverRequests.status, "pending"),
			),
		);
}

export async function findPendingTakeoverForReportAndRequester(
	reportId: string,
	requesterClerkUserId: string,
) {
	const [request] = await db
		.select()
		.from(rescueTakeoverRequests)
		.where(
			and(
				eq(rescueTakeoverRequests.reportId, reportId),
				eq(rescueTakeoverRequests.requestedByClerkUserId, requesterClerkUserId),
				eq(rescueTakeoverRequests.status, "pending"),
			),
		);
	return request;
}

// Conditional decision: only a still-pending request whose target is still the
// deciding dispatcher can be decided. A stale or forged decide returns no row.
export async function decideTakeoverRequest(
	id: string,
	decidingClerkUserId: string,
	status: "approved" | "declined",
	decisionNote: string | null,
) {
	const [request] = await db
		.update(rescueTakeoverRequests)
		.set({
			status,
			decidedByClerkUserId: decidingClerkUserId,
			decidedAt: new Date(),
			decisionNote,
		})
		.where(
			and(
				eq(rescueTakeoverRequests.id, id),
				eq(rescueTakeoverRequests.status, "pending"),
				eq(rescueTakeoverRequests.assignedToClerkUserId, decidingClerkUserId),
			),
		)
		.returning();
	return request;
}

// Requester withdraws their own pending request. Conditional on the requester
// AND on the request still being pending.
export async function withdrawTakeoverRequest(id: string, requesterClerkUserId: string) {
	const [request] = await db
		.update(rescueTakeoverRequests)
		.set({
			status: "withdrawn",
			decidedByClerkUserId: requesterClerkUserId,
			decidedAt: new Date(),
		})
		.where(
			and(
				eq(rescueTakeoverRequests.id, id),
				eq(rescueTakeoverRequests.status, "pending"),
				eq(rescueTakeoverRequests.requestedByClerkUserId, requesterClerkUserId),
			),
		)
		.returning();
	return request;
}

// Closes every pending request for a mission once it has moved on (approved,
// started, released, or resolved) so requesters are never left waiting on a
// mission that is no longer up for grabs. Optionally preserves the request
// that just won, and returns the closed rows so the caller can notify them.
export async function cancelPendingTakeoversForReport(
	reportId: string,
	exceptRequestId?: string,
) {
	return db
		.update(rescueTakeoverRequests)
		.set({ status: "cancelled", decidedAt: new Date() })
		.where(
			and(
				eq(rescueTakeoverRequests.reportId, reportId),
				eq(rescueTakeoverRequests.status, "pending"),
				exceptRequestId ? ne(rescueTakeoverRequests.id, exceptRequestId) : undefined,
			),
		)
		.returning();
}

// Assigned missions held by another dispatcher - the "Assigned to Others"
// list. Only "assigned" (accepted, not started) missions qualify, matching the
// rule that takeover requests apply to Assigned missions only.
export async function findAssignedReportsByOtherDispatcher(clerkUserId: string) {
	return db
		.select()
		.from(rescueReports)
		.where(
			and(
				eq(rescueReports.status, "assigned"),
				isNotNull(rescueReports.assignedToClerkUserId),
				ne(rescueReports.assignedToClerkUserId, clerkUserId),
			),
		)
		.orderBy(desc(rescueReports.createdAt));
}

// Atomic transfer: reassigns a currently-assigned mission from its owner to
// the requesting dispatcher in ONE conditional UPDATE, keeping the status at
// "assigned". The WHERE pins the current owner AND the "assigned" status, so a
// stale approval (owner or status changed under it) touches nothing and
// returns no row - the same race guard the claim/release updates use.
export async function transferRescueReportAssignment(
	id: string,
	fromClerkUserId: string,
	toClerkUserId: string,
	toName: string,
) {
	const [report] = await db
		.update(rescueReports)
		.set({
			assignedTo: toName,
			assignedToClerkUserId: toClerkUserId,
			assignedAt: new Date(),
			status: "assigned",
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(rescueReports.id, id),
				eq(rescueReports.assignedToClerkUserId, fromClerkUserId),
				eq(rescueReports.status, "assigned"),
			),
		)
		.returning();
	return report;
}

// The pending request that lost the race for a mission, reduced to just what a
// cancellation notification needs (who to tell, and which mission).
export type TakeoverClosedRequest = {
	reportId: string;
	requestedByClerkUserId: string;
};

export type TakeoverApprovalOutcome = {
	transferred: boolean;
	approvedRequestId: string | null;
	closed: TakeoverClosedRequest[];
};

// Approve a takeover as ONE server-side statement, so the transfer, the
// approval, the cancellation of every competing pending request, and the
// timeline entry either all land or none do. This is the atomicity the old
// multi-call service path lacked: a failure after the transfer could leave the
// mission moved but the request still pending, or the reverse.
//
// The `target` CTE pins every precondition - the request is still pending, is
// addressed to this decider, this requester made it, and the mission is still
// Assigned to the decider - and locks BOTH rows (`FOR UPDATE OF rr, r`). Two
// competing approvals therefore serialise on the mission (and request) row: the
// loser re-reads the post-commit row, finds the owner changed, and produces no
// `target`, so no transfer and no partial side effects. Later CTEs only read
// from `transferred`, so nothing can run unless the guarded transfer happened.
export async function approveMissionTakeoverAtomically(input: {
	requestId: string;
	reportId: string;
	deciderClerkUserId: string;
	requesterClerkUserId: string;
	requesterName: string;
	historyNotes: string;
}): Promise<TakeoverApprovalOutcome> {
	const result = await db.execute(sql`
		WITH target AS (
			SELECT r.report_id
			FROM rescue_takeover_requests r
			JOIN rescue_reports rr ON rr.id = r.report_id
			WHERE r.id = ${input.requestId}
				AND r.report_id = ${input.reportId}
				AND r.status = 'pending'
				AND r.requested_by_clerk_user_id = ${input.requesterClerkUserId}
				AND r.assigned_to_clerk_user_id = ${input.deciderClerkUserId}
				AND rr.status = 'assigned'
				AND rr.assigned_to_clerk_user_id = ${input.deciderClerkUserId}
			FOR UPDATE OF rr, r
		),
		transferred AS (
			UPDATE rescue_reports rr
			SET assigned_to = ${input.requesterName},
				assigned_to_clerk_user_id = ${input.requesterClerkUserId},
				assigned_at = now(),
				status = 'assigned',
				updated_at = now()
			FROM target t
			WHERE rr.id = t.report_id
			RETURNING rr.id
		),
		approved AS (
			UPDATE rescue_takeover_requests r
			SET status = 'approved',
				decided_by_clerk_user_id = ${input.deciderClerkUserId},
				decided_at = now()
			FROM transferred tr
			WHERE r.id = ${input.requestId}
			RETURNING r.id
		),
		closed AS (
			UPDATE rescue_takeover_requests r
			SET status = 'cancelled',
				decided_at = now()
			FROM transferred tr
			WHERE r.report_id = tr.id
				AND r.status = 'pending'
				AND r.id <> ${input.requestId}
			RETURNING r.report_id, r.requested_by_clerk_user_id
		),
		history AS (
			INSERT INTO rescue_report_status_history
				(report_id, from_status, to_status, changed_by_clerk_user_id, dispatcher_name, notes, image_urls)
			SELECT tr.id, 'assigned', 'assigned', ${input.deciderClerkUserId}, ${input.requesterName}, ${input.historyNotes}, '[]'::jsonb
			FROM transferred tr
			RETURNING id
		)
		SELECT json_build_object(
			'transferred', (SELECT count(*) FROM transferred) > 0,
			'approvedRequestId', (SELECT id FROM approved LIMIT 1),
			'historyId', (SELECT id FROM history LIMIT 1),
			'closed', COALESCE((
				SELECT json_agg(json_build_object(
					'reportId', c.report_id,
					'requestedByClerkUserId', c.requested_by_clerk_user_id
				))
				FROM closed c
			), '[]'::json)
		) AS result
	`);

	const raw = result.rows[0]?.result;
	const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as
		| { transferred: boolean; approvedRequestId: string | null; closed: TakeoverClosedRequest[] }
		| undefined;
	return {
		transferred: parsed?.transferred ?? false,
		approvedRequestId: parsed?.approvedRequestId ?? null,
		closed: parsed?.closed ?? [],
	};
}

// Create a pending takeover request only while the mission is still Assigned
// to another dispatcher, as ONE statement. The `locked` CTE takes a row lock on
// the mission first, so a concurrent transfer/start/release (which also locks
// the mission row) serialises around it: whichever commits first wins, and the
// loser sees the post-commit row and inserts nothing. Returns undefined when
// the mission is no longer eligible; a duplicate pending request is left to
// surface as a unique-constraint error so the caller can map it to 409.
export async function createPendingTakeoverRequestIfEligible(input: {
	reportId: string;
	requesterClerkUserId: string;
	requesterName: string;
	reason: string;
}): Promise<{ id: string } | undefined> {
	const result = await db.execute(sql`
		WITH locked AS (
			SELECT rr.id, rr.assigned_to_clerk_user_id
			FROM rescue_reports rr
			WHERE rr.id = ${input.reportId}
				AND rr.status = 'assigned'
				AND rr.assigned_to_clerk_user_id IS NOT NULL
				AND rr.assigned_to_clerk_user_id <> ${input.requesterClerkUserId}
			FOR UPDATE
		)
		INSERT INTO rescue_takeover_requests
			(report_id, requested_by_clerk_user_id, requested_by_name, assigned_to_clerk_user_id, reason, status)
		SELECT l.id, ${input.requesterClerkUserId}, ${input.requesterName},
			l.assigned_to_clerk_user_id, ${input.reason}, 'pending'
		FROM locked l
		RETURNING id
	`);

	const row = result.rows[0] as { id: string } | undefined;
	return row ? { id: row.id } : undefined;
}

// True only for the (report, requester) WHERE pending unique index. A Postgres
// unique violation is SQLSTATE 23505; every other database error must fall
// through so the caller does not mislabel a real failure as "already pending".
export function isPendingTakeoverUniqueViolation(error: unknown): boolean {
	const candidate = (error ?? {}) as {
		code?: string;
		constraint?: string;
		cause?: { code?: string; constraint?: string };
	};
	const code = candidate.code ?? candidate.cause?.code;
	if (code !== "23505") return false;
	const constraint = candidate.constraint ?? candidate.cause?.constraint;
	return constraint === undefined || constraint.includes("rescue_takeover_pending_unique");
}