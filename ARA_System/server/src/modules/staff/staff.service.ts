import { clerkClient } from "../../services/clerkClient.js";
import { invitationalStaffRoles } from "../../shared/types/roles.js";

export const staffRoles = invitationalStaffRoles;
export type StaffRole = (typeof staffRoles)[number];

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
