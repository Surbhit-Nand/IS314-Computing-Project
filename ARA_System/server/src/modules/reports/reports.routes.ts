import { Router } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireManagerOrAdmin } from "../../middleware/rbac.js";
import { buildAnalyticsReport } from "./reports.service.js";

const rangeSchema = z.enum(["30d", "90d", "12m", "all"]);

// Manager/admin reporting: live analytics across animals, rescue reports,
// adoption applications, and donations. Read-only aggregation over existing
// tables - no writes, no schema changes.
export const reportsRouter = Router();

reportsRouter.get(
	"/analytics",
	requireClerkSession,
	requireManagerOrAdmin,
	async (request, response, next) => {
		try {
			const parsed = rangeSchema.safeParse(request.query.range);
			const range = parsed.success ? parsed.data : "90d";
			const report = await buildAnalyticsReport(range);
			response.json(report);
		} catch (error) {
			next(error);
		}
	},
);