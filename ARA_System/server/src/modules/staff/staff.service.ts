import { clerkClient } from "../../services/clerkClient.js";
import { logAuditEntry } from "../../shared/audit/audit.service.js";
import { invitationalStaffRoles } from "../../shared/types/roles.js";

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
// veterinarians, and rescuers; nobody (including admins) can change their own.
const adminOnlyRoles: readonly StaffRole[] = ["manager", "admin"];

function getStaffRole(user: { publicMetadata?: { role?: unknown } }): StaffRole | undefined {
	const role = user.publicMetadata?.role;
	return typeof role === "string" && (staffRoles as readonly string[]).includes(role)
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
// - A manager may manage staff/veterinarian/rescuer roles, but must never
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
export async function revokeInvitation(actorClerkUserId: string, invitationId: string) {
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

export async function inviteStaffMember(emailAddress: string, role: StaffRole) {
	return clerkClient.invitations.createInvitation({
		emailAddress,
		notify: true,
		publicMetadata: { role },
		redirectUrl: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
	});
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
			role: user.publicMetadata.role,
			status: "Active" as const,
		}))
		.filter((member) => staffRoles.includes(member.role as StaffRole));

	const pendingInvitations = invitations.data.map((invitation) => ({
		id: invitation.id,
		emailAddress: invitation.emailAddress,
		role: invitation.publicMetadata?.role ?? "Unassigned",
		status: "Pending" as const,
	}));

	return { members, pendingInvitations };
}
