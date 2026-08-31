import { Router } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireManagerOrAdmin } from "../../middleware/rbac.js";
import { inviteStaffMember, listStaffAccess, staffRoles } from "./staff.service.js";

const invitationSchema = z.object({
	emailAddress: z.string().email(),
	role: z.enum(staffRoles),
});

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
				request.clerkOrgId,
			);
			response.status(201).json({
				id: invitation.id,
				emailAddress: invitation.emailAddress,
				role: parsed.data.role,
				status: invitation.status,
			});
		} catch (error) {
			console.error("[INVITATION_ERROR]", error instanceof Error ? error.message : error);
			// Return the actual error details for debugging
			const errorMessage = error instanceof Error ? error.message : String(error);
			response.status(500).json({
				error: "Invitation failed",
				details: errorMessage,
			});
		}
	},
);
