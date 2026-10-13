import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireManagerOrAdmin } from "../../middleware/rbac.js";
import {
	inviteStaffMember,
	listStaffAccess,
	reconcileOwnRoleFromInvitation,
	revokeInvitation,
	revokeStaffRole,
	staffRoles,
	StaffActionError,
	updateStaffRole,
} from "./staff.service.js";

const invitationSchema = z.object({
	emailAddress: z.string().email(),
	role: z.enum(staffRoles),
});

const roleUpdateSchema = z.object({
	role: z.enum(staffRoles),
});

// Express types a route param as `string | string[]` because a path pattern
// could in principle capture a param more than once. Our routes only ever
// use a single ":id" segment, so this narrows it back down to a plain string.
function getIdParam(value: string | string[]): string {
	return Array.isArray(value) ? value[0] : value;
}

// Permission/not-found failures from the role-management service become the
// matching 4xx response; returns true when handled (so the caller can stop).
function handleStaffActionError(error: unknown, response: Response): boolean {
	if (error instanceof StaffActionError) {
		response.status(error.status).json({ error: error.message });
		return true;
	}
	return false;
}

type ClerkApiError = {
	clerkError: boolean;
	status: number;
	errors: Array<{
		code: string;
		message: string;
		longMessage?: string;
		meta?: { emailAddresses?: string[] };
	}>;
};

// Clerk surfaces business-rule violations (duplicate invitation, email already
// registered) as API errors. Map those to friendly 4xx responses so the admin
// sees *why* the invite failed instead of a generic 500.
function mapInvitationError(error: unknown): { status: number; error: string } | null {
	if (typeof error !== "object" || error === null) return null;
	const clerkError = error as ClerkApiError;
	if (clerkError.clerkError !== true || !Array.isArray(clerkError.errors) || clerkError.errors.length === 0) {
		return null;
	}

	const first = clerkError.errors[0];
	const message = first.longMessage ?? first.message;

	if (first.code === "duplicate_record") {
		return { status: 409, error: message };
	}
	if (first.code === "form_identifier_exists") {
		return { status: 409, error: message };
	}

	return null;
}

export const staffRouter = Router();

staffRouter.get(
	"/staff",
	requireClerkSession,
	requireManagerOrAdmin,
	async (_request, response, next) => {
		try {
			response.json(await listStaffAccess());
		} catch (error) {
			next(error);
		}
	},
);

staffRouter.post(
	"/invitations",
	requireClerkSession,
	requireManagerOrAdmin,
	async (request, response) => {
		const parsed = invitationSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "A valid email address and role are required" });
			return;
		}

		try {
			const invitation = await inviteStaffMember(
				request.clerkUserId as string,
				parsed.data.emailAddress,
				parsed.data.role,
			);
			response.status(201).json({
				id: invitation.id,
				emailAddress: invitation.emailAddress,
				role: parsed.data.role,
				status: invitation.status,
			});
		} catch (error) {
			console.error("[INVITATION_ERROR]", error instanceof Error ? error.message : error);

			if (handleStaffActionError(error, response)) return;

			const mapped = mapInvitationError(error);
			if (mapped) {
				response.status(mapped.status).json({ error: mapped.error });
				return;
			}

			response.status(500).json({ error: "Invitation failed" });
		}
	},
);

// Change an existing member's role on their Clerk account. Gated by the same
// manager/admin middleware; finer permission rules (admins rule managers/
// admins, no self-changes) live in the service.
staffRouter.patch(
	"/staff/:id/role",
	requireClerkSession,
	requireManagerOrAdmin,
	async (request, response, next) => {
		const parsed = roleUpdateSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "A valid role is required" });
			return;
		}

		try {
			const result = await updateStaffRole(
				request.clerkUserId as string,
				getIdParam(request.params.id),
				parsed.data.role,
			);
			response.json(result);
		} catch (error) {
			if (handleStaffActionError(error, response)) return;
			next(error);
		}
	},
);

// Remove a member's staff role (demotes them to a regular registered user).
staffRouter.delete(
	"/staff/:id/role",
	requireClerkSession,
	requireManagerOrAdmin,
	async (request, response, next) => {
		try {
			const result = await revokeStaffRole(
				request.clerkUserId as string,
				getIdParam(request.params.id),
			);
			response.json(result);
		} catch (error) {
			if (handleStaffActionError(error, response)) return;
			next(error);
		}
	},
);

// Self-service role reconcile for the signed-in caller only. Deliberately
// NOT manager/admin-gated: any registered user may trigger it, but the
// service only ever stamps a role from an invitation matching their own
// email and never overwrites an existing one, so it cannot escalate anyone.
// Exists because the Clerk user.created webhook can't reach localhost in
// dev, leaving invitees without publicMetadata.role (and thus 403'd).
staffRouter.post(
	"/invitations/reconcile",
	requireClerkSession,
	async (request, response, next) => {
		try {
			response.json(await reconcileOwnRoleFromInvitation(request.clerkUserId as string));
		} catch (error) {
			if (handleStaffActionError(error, response)) return;
			next(error);
		}
	},
);

// Withdraw a pending invitation so the invitee can no longer accept it.
staffRouter.post(
	"/invitations/:id/revoke",
	requireClerkSession,
	requireManagerOrAdmin,
	async (request, response, next) => {
		try {
			const result = await revokeInvitation(
				request.clerkUserId as string,
				getIdParam(request.params.id),
			);
			response.json(result);
		} catch (error) {
			if (handleStaffActionError(error, response)) return;
			next(error);
		}
	},
);
