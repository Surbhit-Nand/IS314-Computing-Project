import { findInvitationRole, stampInvitationRole } from "../services/invitationRole.js";
import { invitationalStaffRoles } from "../shared/types/roles.js";

type StaffRole = (typeof invitationalStaffRoles)[number];

function isStaffRole(value: unknown): value is StaffRole {
	return typeof value === "string" && (invitationalStaffRoles as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Fired by POST /api/webhooks on Clerk's user.created / user.updated. Stamps
// the role from the matching staff invitation into the user's publicMetadata
// so role-gated routes authorise the new team member. Clerk is supposed to
// copy the invitation's publicMetadata onto the user at accept, but that is
// not reliable (pre-existing accounts, social sign-up), and requireRole() in
// middleware/rbac.ts reads the role ONLY from the user record - so without
// this reconciliation an invitee missing the role is 403'd everywhere.
//
// Idempotent: skips when a valid role is already present (e.g. Clerk's own
// propagation worked, an admin has already assigned one, or a previous
// delivery of this event succeeded), so webhook retries and the user.updated
// echo of our own metadata write are safe. The same handler covers both
// events because an existing account accepting an invitation only ever fires
// user.updated - user.created never arrives for them.
export async function handleUserSync(
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

	await stampInvitationRole({
		userId,
		role,
		emailAddress: email,
		auditActor: "system:clerk-webhook",
		source: "clerk-webhook",
	});
}
