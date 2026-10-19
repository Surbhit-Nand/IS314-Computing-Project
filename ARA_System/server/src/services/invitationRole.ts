import { clerkClient } from "./clerkClient.js";
import { logAuditEntry } from "../shared/audit/audit.service.js";
import { invitationalStaffRoles } from "../shared/types/roles.js";

export type InvitationStaffRole = (typeof invitationalStaffRoles)[number];

function isStaffRole(value: unknown): value is InvitationStaffRole {
	return typeof value === "string" && (invitationalStaffRoles as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Finds the staff role carried by a Clerk invitation for this email address.
// The admin invite route stores the chosen role on the *invitation*'s
// publicMetadata; this lookup is what delivers it onto the user account.
//
// Uses the Backend API's `query` filter so the search is email-targeted
// instead of scanning a capped global list, and deliberately passes NO
// `status`: Clerk's invitation list then returns non-revoked invitations
// (pending AND accepted), so the role is still recoverable after the invitee
// has clicked through and the invitation left the pending list. Results come
// newest-first, and the exact (case-insensitive) email match below filters
// out any partial-query spillover.
export async function findInvitationRole(
	emailAddress: string,
): Promise<InvitationStaffRole | undefined> {
	const invitations = await clerkClient.invitations.getInvitationList({
		query: emailAddress,
		limit: 10,
	});

	for (const invitation of invitations.data) {
		if (invitation.emailAddress.toLowerCase() !== emailAddress.toLowerCase()) {
			continue;
		}
		const role = isRecord(invitation.publicMetadata) ? invitation.publicMetadata.role : undefined;
		if (isStaffRole(role)) {
			return role;
		}
	}
	return undefined;
}

// Writes the invitation's role onto the user's Clerk publicMetadata and
// records an audit entry. Audit failures are swallowed (logged, not thrown)
// so a broken audit table can never block role provisioning - the stamp
// itself is the critical part. Shared by the user.created/user.updated
// webhook handler and the self-service reconcile endpoint.
export async function stampInvitationRole(params: {
	userId: string;
	role: InvitationStaffRole;
	emailAddress: string;
	auditActor: string;
	source: "clerk-webhook" | "self-reconcile";
}): Promise<void> {
	await clerkClient.users.updateUserMetadata(params.userId, {
		publicMetadata: { role: params.role },
	});

	try {
		await logAuditEntry({
			actorClerkUserId: params.auditActor,
			action: "staff.role.provisioned",
			entityType: "user",
			entityId: params.userId,
			metadata: { emailAddress: params.emailAddress, role: params.role, source: params.source },
		});
	} catch (error) {
		console.error("[ROLE_PROVISION_AUDIT_FAILED]", error instanceof Error ? error.message : error);
	}
}
