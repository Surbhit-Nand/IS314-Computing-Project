import { clerkClient } from "../../services/clerkClient.js";
import { findInvitationRole, stampInvitationRole } from "../../services/invitationRole.js";
import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { normalizeRole, invitationalStaffRoles } from "../../shared/types/roles.js";

export const staffRoles = invitationalStaffRoles;
export type StaffRole = (typeof staffRoles)[number];

// Thrown by role-management actions when the caller tries something the
// permission rules forbid (self-change, or a manager touching a manager/admin
// role) or the target doesn't exist. The route maps `status` onto the HTTP
// response - 403 for permission, 404/400 for bad targets.
export class StaffActionError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "StaffActionError";
	}
}

// Roles only an admin may assign or revoke. Managers can manage staff,
// veterinarians, and dispatchers; nobody (including admins) can change their own.
const adminOnlyRoles: readonly StaffRole[] = ["manager", "admin"];

// Reads a user's staff role off their Clerk account, normalising the
// pre-rename `rescuer` value so legacy accounts still resolve to `dispatcher`.
// Anything missing or unrecognised is undefined ("no staff role"), which the
// role-management actions below treat as "not a staff member".
function getStaffRole(user: { publicMetadata?: { role?: unknown } }): StaffRole | undefined {
	const role = normalizeRole(user.publicMetadata?.role);
	return role !== undefined && (staffRoles as readonly string[]).includes(role)
		? (role as StaffRole)
		: undefined;
}

// Clerk surfaces a missing user/invitation as a 404 API error; map that to a
// friendly 404 StaffActionError instead of a bare 500.
function isClerkNotFound(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	return (error as { status?: unknown }).status === 404;
}

async function getUserOrThrow(targetUserId: string) {
	try {
		return await clerkClient.users.getUser(targetUserId);
	} catch (error: unknown) {
		if (isClerkNotFound(error)) {
			throw new StaffActionError("User not found.", 404);
		}
		throw error;
	}
}

// Permission gate shared by role edits and revocations:
// - An admin may manage anyone except themselves.
// - A manager may manage staff/veterinarian/dispatcher roles, but must never
//   touch a manager/admin target nor assign toward a manager/admin role.
async function assertCanManageTarget(
	actorClerkUserId: string,
	targetUserId: string,
	targetRole: StaffRole | undefined,
	nextRole?: StaffRole,
) {
	if (actorClerkUserId === targetUserId) {
		throw new StaffActionError("You cannot change or revoke your own role.", 403);
	}

	const actor = await clerkClient.users.getUser(actorClerkUserId);
	if (getStaffRole(actor) !== "admin") {
		const touchesAdminRole =
			(targetRole !== undefined && adminOnlyRoles.includes(targetRole)) ||
			(nextRole !== undefined && adminOnlyRoles.includes(nextRole));
		if (touchesAdminRole) {
			throw new StaffActionError("Only an admin can change or revoke a Manager or Admin role.", 403);
		}
	}
}

// Changes a member's role on their Clerk account. The new role must be one of
// the invitable staff roles; senders are restricted by assertCanManageTarget.
export async function updateStaffRole(actorClerkUserId: string, targetUserId: string, newRole: StaffRole) {
	const target = await getUserOrThrow(targetUserId);
	const fromRole = getStaffRole(target);
	await assertCanManageTarget(actorClerkUserId, targetUserId, fromRole, newRole);

	await clerkClient.users.updateUserMetadata(targetUserId, { publicMetadata: { role: newRole } });

	await logAuditEntry({
		actorClerkUserId,
		action: "staff.role.updated",
		entityType: "user",
		entityId: targetUserId,
		metadata: {
			fromRole: fromRole ?? null,
			toRole: newRole,
			emailAddress: target.primaryEmailAddress?.emailAddress ?? null,
		},
	});

	return { id: targetUserId, role: newRole };
}

// Removes a member's staff role (publicMetadata.role -> null), turning them
// back into a regular registered user. Their Clerk account is kept so their
// history (reports, applications) stays intact.
export async function revokeStaffRole(actorClerkUserId: string, targetUserId: string) {
	const target = await getUserOrThrow(targetUserId);
	const fromRole = getStaffRole(target);
	await assertCanManageTarget(actorClerkUserId, targetUserId, fromRole);

	if (fromRole === undefined) {
		throw new StaffActionError("This user does not have a staff role to revoke.", 400);
	}

	await clerkClient.users.updateUserMetadata(targetUserId, { publicMetadata: { role: null } });

	await logAuditEntry({
		actorClerkUserId,
		action: "staff.role.revoked",
		entityType: "user",
		entityId: targetUserId,
		metadata: { fromRole, emailAddress: target.primaryEmailAddress?.emailAddress ?? null },
	});

	return { id: targetUserId, role: null };
}

// Withdraws a pending invitation so the recipient can no longer accept it.
// Managers may only revoke invitations for staff/veterinarian/dispatcher
// roles - revoking a manager/admin invitation needs an admin, mirroring the
// rule for editing those roles. The invitation's role is looked up first via
// an id-targeted query so the check runs before anything is revoked.
export async function revokeInvitation(actorClerkUserId: string, invitationId: string) {
	const lookup = await clerkClient.invitations.getInvitationList({ query: invitationId, limit: 10 });
	const target = lookup.data.find((invitation) => invitation.id === invitationId);
	if (target) {
		const actor = await clerkClient.users.getUser(actorClerkUserId);
		const invitedRole = target.publicMetadata?.role;
		if (
			getStaffRole(actor) !== "admin" &&
			typeof invitedRole === "string" &&
			(adminOnlyRoles as readonly string[]).includes(invitedRole)
		) {
			throw new StaffActionError("Only an admin can revoke a Manager or Admin invitation.", 403);
		}
	}

	let revoked: Awaited<ReturnType<typeof clerkClient.invitations.revokeInvitation>>;
	try {
		revoked = await clerkClient.invitations.revokeInvitation(invitationId);
	} catch (error: unknown) {
		if (isClerkNotFound(error)) {
			throw new StaffActionError("Invitation not found.", 404);
		}
		throw error;
	}

	await logAuditEntry({
		actorClerkUserId,
		action: "staff.invitation.revoked",
		entityType: "invitation",
		entityId: invitationId,
		metadata: {
			emailAddress: revoked.emailAddress,
			role: revoked.publicMetadata?.role ?? null,
		},
	});

	return { id: revoked.id, emailAddress: revoked.emailAddress, status: revoked.status };
}

// Permission gate for sending invitations. Mirrors assertCanManageTarget's
// admin-only rule: a manager may invite staff/veterinarian/dispatcher, but
// only an admin may invite a manager or admin. Without this, any manager
// could escalate themselves a peer admin account purely by invitation.
async function assertCanInvite(actorClerkUserId: string, role: StaffRole) {
	const actor = await clerkClient.users.getUser(actorClerkUserId);
	if (getStaffRole(actor) !== "admin" && adminOnlyRoles.includes(role)) {
		throw new StaffActionError("Only an admin can invite a Manager or Admin.", 403);
	}
}

export async function inviteStaffMember(actorClerkUserId: string, emailAddress: string, role: StaffRole) {
	await assertCanInvite(actorClerkUserId, role);

	const invitation = await clerkClient.invitations.createInvitation({
		emailAddress,
		notify: true,
		publicMetadata: { role },
		redirectUrl: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
	});

	// The invite email is already sent at this point, so an audit failure
	// must not turn the response into a 500 (the admin would retry into a
	// duplicate_record 409 for an invitation that already exists).
	try {
		await logAuditEntry({
			actorClerkUserId,
			action: "staff.invitation.created",
			entityType: "invitation",
			entityId: invitation.id,
			metadata: { emailAddress: invitation.emailAddress, role },
		});
	} catch (error) {
		console.error("[INVITATION_AUDIT_FAILED]", error instanceof Error ? error.message : error);
	}

	return invitation;
}

// Fallback for the invitation -> user role handoff when the Clerk webhook
// doesn't arrive (local dev has no public URL for Clerk to POST to) or the
// invitee's account existed before the invitation was accepted (only
// user.updated fires, which older webhook deployments may miss). Any
// signed-in user may call it for THEIR OWN account only: if they have no
// staff role yet but a pending/accepted invitation exists for their email,
// the invitation's role is stamped now. Never overwrites an existing role.
export async function reconcileOwnRoleFromInvitation(userId: string) {
	const user = await getUserOrThrow(userId);

	const existingRole = normalizeRole(user.publicMetadata?.role);
	if (existingRole !== undefined) {
		return { role: existingRole, stamped: false as const };
	}

	const email = user.primaryEmailAddress?.emailAddress;
	if (!email) {
		return { role: null, stamped: false as const };
	}

	const role = await findInvitationRole(email);
	if (!role) {
		return { role: null, stamped: false as const };
	}

	await stampInvitationRole({
		userId,
		role,
		emailAddress: email,
		auditActor: userId,
		source: "self-reconcile",
	});

	return { role, stamped: true as const };
}

export async function listStaffAccess() {
	const [users, invitations] = await Promise.all([
		clerkClient.users.getUserList({ limit: 100 }),
		clerkClient.invitations.getInvitationList({ status: "pending", limit: 100 }),
	]);

	const members = users.data
		.map((user) => ({
			id: user.id,
			name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user",
			emailAddress: user.primaryEmailAddress?.emailAddress ?? "No email address",
			// Normalised so a pre-rename `rescuer` shows up as "dispatcher" and
			// stays editable in the role dropdown instead of being filtered out.
			role: normalizeRole(user.publicMetadata.role) ?? null,
			status: "Active" as const,
		}))
		.filter((member) => member.role !== null);

	const pendingInvitations = invitations.data.map((invitation) => ({
		id: invitation.id,
		emailAddress: invitation.emailAddress,
		role: invitation.publicMetadata?.role ?? "Unassigned",
		status: "Pending" as const,
	}));

	return { members, pendingInvitations };
}
