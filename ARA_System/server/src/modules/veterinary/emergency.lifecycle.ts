import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionQuery } from "../../db/transaction.js";

// Run after an animal update in the SAME transaction. An episode ends only
// when the animal leaves active Critical care, never on Attend or Release.
// Retain the closed response and audit its former owner for future episodes.
export function emergencyClosureStatement(animalId?: string, actor = "system:emergency-lifecycle") {
  return sql`WITH ending AS (
    SELECT response.* FROM veterinary_emergency_responses response
    JOIN animals animal ON animal.id=response.animal_id
    WHERE response.closed_at IS NULL ${animalId ? sql`AND animal.id=${animalId}` : sql``}
      AND (animal.deleted_at IS NOT NULL OR animal.medically_cleared=true
        OR animal.status IN ('adopted','closed') OR animal.veterinary_priority IS DISTINCT FROM 'critical')
    FOR UPDATE OF response
  ), closed AS (
    UPDATE veterinary_emergency_responses response SET attending_veterinarian_clerk_user_id=NULL,
      support_required=false,closed_at=clock_timestamp(),updated_at=clock_timestamp(),
      updated_by_clerk_user_id=${actor},version=response.version+1
    FROM ending WHERE response.id=ending.id RETURNING response.*
  ) INSERT INTO audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata,created_at)
    SELECT ${actor},'veterinary_emergency_closed','veterinary_emergency_response',closed.id::text,
      jsonb_build_object('animalId',closed.animal_id,'previousVeterinarian',ending.attending_veterinarian_clerk_user_id,
        'attendingVeterinarian',NULL,'previousVersion',ending.version,'version',closed.version,
        'closedAt',closed.closed_at,'reason','Animal left active Critical care'),clock_timestamp()
    FROM closed JOIN ending ON ending.id=closed.id`;
}

export async function closeInactiveEmergencyResponses(query: TransactionQuery) {
  const statement = new PgDialect().sqlToQuery(emergencyClosureStatement());
  await query(statement.sql, statement.params);
}
