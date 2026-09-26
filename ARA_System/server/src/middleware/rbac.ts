import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { clerkClient } from "../services/clerkClient.js";
import { managerOrAdminRoles, staffOrAboveRoles, type Role } from "../shared/types/roles.js";

// Only veterinarian accounts can access veterinary routes. Staff register
// animals and run rescue/adoption ops but cannot view medical records or
// issue clearance.
const veterinaryRoles: readonly Role[] = ["veterinarian"];

// Looks up the signed-in Clerk user's role and rejects the request (403) if
// their role isn't in the allowed list. requireClerkSession must run first
// so `request.clerkUserId` is set.
//
// The real role check below (Clerk lookup + allowedRoles.includes) is
// untouched and still runs for every request in every environment. The only
// addition is the DEV_BYPASS_AUTH early-return above it, sourced from
// env.devBypassAuth (server/.env, gitignored) and off by default - see
// config/env.ts for how that flag is read.
function requireRole(allowedRoles: readonly Role[], deniedMessage: string) {
	return (request: Request, response: Response, next: NextFunction) => {
		void (async () => {
			if (!request.clerkUserId) {
				response.status(401).json({ error: "Authentication is required" });
				return;
			}

			// DEV-ONLY BYPASS. Still requires a signed-in Clerk session (the check
			// above), it only skips the role-membership check that follows.
			if (env.devBypassAuth) {
				next();
				return;
			}

			const user = await clerkClient.users.getUser(request.clerkUserId);
			const role = user.publicMetadata.role;

			if (!allowedRoles.includes(role as Role)) {
				response.status(403).json({ error: deniedMessage });
				return;
			}

			next();
		})().catch(next);
	};
}

// Gate for staff-facing actions: registering/editing animal profiles,
// uploading animal photos, viewing the staff animal list.
export const requireStaffOrAbove = requireRole(
	staffOrAboveRoles,
	"Staff, veterinarian, manager, or admin access is required",
);

// Gate for manager-only actions: staff account/invitation management.
export const requireManagerOrAdmin = requireRole(
	managerOrAdminRoles,
	"Manager or admin access is required",
);

export const requireVeterinaryAccess = requireRole(
	veterinaryRoles,
	"Veterinarian access is required",
);
