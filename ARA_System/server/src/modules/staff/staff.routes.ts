import { Router } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireManagerOrAdmin } from "../../middleware/rbac.js";
import { inviteStaffMember, listStaffAccess, staffRoles } from "./staff.service.js";

const invitationSchema = z.object({
	emailAddress: z.string().email(),
	role: z.enum(staffRoles),
});

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

			const mapped = mapInvitationError(error);
			if (mapped) {
				response.status(mapped.status).json({ error: mapped.error });
				return;
			}

			// Unknown error - return the actual error details for debugging
			const errorMessage = error instanceof Error ? error.message : String(error);
			response.status(500).json({
				error: "Invitation failed",
				details: errorMessage,
			});
		}
	},
);
