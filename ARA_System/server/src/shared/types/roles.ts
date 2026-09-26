// All the account roles Clerk can assign via `publicMetadata.role`.
// Kept in one place so route/middleware role checks don't drift out of sync
// with each other (see AGENTS.md's "Entities & role-based access" section).
export const roles = ["staff", "veterinarian", "manager", "admin", "dispatcher"] as const;
export type Role = (typeof roles)[number];

// `rescuer` was renamed to `dispatcher` (see AGENTS.md's "Dispatcher" role).
// Clerk accounts created before the rename still carry the old value in
// publicMetadata.role, so every server-side read normalises it to the current
// name. Writes only ever store current names - the request schemas enumerate
// `staffRoles`, so `rescuer` can never be written back. Once the remaining
// legacy accounts have been updated in Clerk, this map and the callers that
// normalise through it can be deleted.
export const legacyRoleAliases: Readonly<Record<string, Role>> = {
	rescuer: "dispatcher",
};

// Maps a raw publicMetadata.role value onto a current Role, resolving legacy
// aliases first. Returns undefined for missing or unrecognised values so
// callers treat them as "no role" instead of trusting arbitrary metadata.
export function normalizeRole(role: unknown): Role | undefined {
	if (typeof role !== "string") return undefined;
	const resolved = legacyRoleAliases[role] ?? role;
	return (roles as readonly string[]).includes(resolved) ? (resolved as Role) : undefined;
}

// Roles allowed to register/edit animal profiles (staff and above, per
// AGENTS.md: "SPCA staff — register animals").
export const staffOrAboveRoles = ["staff", "veterinarian", "manager", "admin"] as const satisfies readonly Role[];

// Roles allowed to read the rescue queue. Only dispatchers can mutate a case.
export const dispatcherRoles = ["dispatcher"] as const satisfies readonly Role[];
export const rescueQueueRoles = ["dispatcher", "staff", "veterinarian", "manager", "admin"] as const satisfies readonly Role[];

// Roles allowed to manage staff accounts/invitations (manager and admin only).
export const managerOrAdminRoles = ["manager", "admin"] as const satisfies readonly Role[];

// Staff-role values used for invitation creation and listing. `admin` is
// included here because an admin can also manage team access and create
// invitations, even though the manager/admin gate is enforced separately.
export const invitationalStaffRoles = ["staff", "veterinarian", "manager", "admin", "dispatcher"] as const satisfies readonly Role[];
