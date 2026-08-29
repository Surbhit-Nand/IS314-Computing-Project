// All the account roles Clerk can assign via `publicMetadata.role`.
// Kept in one place so route/middleware role checks don't drift out of sync
// with each other (see AGENTS.md's "Entities & role-based access" section).
export const roles = ["staff", "veterinarian", "manager", "admin"] as const;
export type Role = (typeof roles)[number];

// Roles allowed to register/edit animal profiles (staff and above, per
// AGENTS.md: "SPCA staff — register animals").
export const staffOrAboveRoles = ["staff", "veterinarian", "manager", "admin"] as const satisfies readonly Role[];

// Roles allowed to manage staff accounts/invitations (manager and admin only).
export const managerOrAdminRoles = ["manager", "admin"] as const satisfies readonly Role[];
