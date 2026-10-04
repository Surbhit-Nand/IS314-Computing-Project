import { clerkClient } from "../services/clerkClient.js";
import { logAuditEntry } from "../shared/audit/audit.service.js";
import { invitationalStaffRoles } from "../shared/types/roles.js";

type StaffRole = (typeof invitationalStaffRoles)[number];

function isStaffRole(value: unknown): value is StaffRole {
	return typeof value === "string" && (invitationalStaffRoles as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The admin invite route stores the chosen role on the *invitation*'s
// publicMetadata. Clerk is supposed to copy that onto the new user's
// publicMetadata at sign-up, but that is not reliable (pre-existing accounts,
// social sign-up). requireRole() in middleware/rbac.ts reads the role ONLY
// from the user record, so an invitee missing it is 403'd everywhere. This
// reconciliation is what actually delivers the role to the user.
async function findInvitationRole(emailAddress: string): Promise<StaffRole | undefined> {
	// getInvitationList returns pending + accepted invitations (only revoked
	// are excluded), newest first - matching on email recovers the role even
	// after the user has accepted and the invitation is no longer pending.
	const invitations = await clerkClient.invitations.getInvitationList({ limit: 100 });

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

// Fired by POST /api/webhooks on Clerk's user.created. Stamps the role from
// the matching staff invitation into the user's publicMetadata so role-gated
// routes authorise the new team member. Idempotent: skips when a valid role
// is already present (e.g. Clerk's own propagation worked, or an admin has
// already assigned one), so webhook retries are safe.
export async function handleUserCreated(
	userId: string,
	emailAddresses: Array<{ email_address?: string }>,
	existingPublicMetadata: unknown,
) {
	const existingRole = isRecord(existingPublicMetadata) ? existingPublicMetadata.role : undefined;
	if (isStaffRole(existingRole)) {
		return;
	}

	const email = emailAddresses.find((entry) => entry.email_address)?.email_address;
	if (!email) {
		return;
	}

	const role = await findInvitationRole(email);
	if (!role) {
		return;
	}

	await clerkClient.users.updateUserMetadata(userId, { publicMetadata: { role } });

	try {
		await logAuditEntry({
			actorClerkUserId: "system:clerk-webhook",
			action: "staff.role.provisioned",
			entityType: "user",
			entityId: userId,
			metadata: { emailAddress: email, role },
		});
	} catch (error) {
		console.error("[WEBHOOK_AUDIT_FAILED]", error instanceof Error ? error.message : error);
	}
}