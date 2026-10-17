import { z } from "zod";
import {
	triageClinicalStability,
	triageConditionTrend,
	triageEmergencyFinding,
	triageInterventionUrgency,
} from "../../db/schema.js";

export const rapidTriageAssessmentSchema = z.object({
	clinicalStability: z.enum(triageClinicalStability.enumValues),
	interventionUrgency: z.enum(triageInterventionUrgency.enumValues),
	conditionTrend: z.enum(triageConditionTrend.enumValues),
	emergencyFindings: z
		.array(z.enum(triageEmergencyFinding.enumValues))
		.max(triageEmergencyFinding.enumValues.length)
		.refine((findings) => new Set(findings).size === findings.length),
	notes: z.string().trim().max(2000).optional(),
}).strict();

export type RapidTriageAssessmentInput = z.infer<typeof rapidTriageAssessmentSchema>;
