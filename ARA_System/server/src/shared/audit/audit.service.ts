import { db } from "../../db/client.js";
import { auditLogs } from "../../db/schema.js";

// Appends one row to the audit trail. Every staff action that AGENTS.md
// flags for audit (rescue assignments/status changes, and later adoption
// approvals and donations) funnels through here so the trail stays complete
// and queryable via audit_logs.
export async function logAuditEntry(input: {
	actorClerkUserId: string;
	action: string;
	entityType: string;
	entityId: string;
	metadata?: Record<string, unknown>;
}) {
	await db.insert(auditLogs).values(input);
}