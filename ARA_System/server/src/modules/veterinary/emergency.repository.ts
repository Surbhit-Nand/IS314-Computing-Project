import { and, desc, eq, inArray, isNull, not } from "drizzle-orm";
import { db } from "../../db/client.js";
import { withSqlTransaction } from "../../db/transaction.js";
import { auditLogs, veterinaryEmergencyResponses, animals } from "../../db/schema.js";
import type { AssistanceReceipt } from "../notifications/veterinaryAssistance.service.js";

export type EmergencyResponse = typeof veterinaryEmergencyResponses.$inferSelect;
export type EmergencyQuery = (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

const columns = `id, animal_id AS "animalId",
 attending_veterinarian_clerk_user_id AS "attendingVeterinarianClerkUserId",
 support_required AS "supportRequired", coordination_note AS "coordinationNote",
 version, updated_by_clerk_user_id AS "updatedByClerkUserId",
 created_at AS "createdAt", updated_at AS "updatedAt", closed_at AS "closedAt"`;

// Every mutation locks the same animal row.
// READ COMMITTED gives subsequent queries a fresh snapshot after waiting for
// that lock. The unique open-animal index is an additional database safeguard.
export function createEmergencyStore(query: EmergencyQuery) {
  return {
    query,
    async activeCritical(animalId: string) {
      return (await query(`SELECT id FROM animals WHERE id=$1 AND deleted_at IS NULL
        AND veterinary_priority='critical' AND medically_cleared=false AND status NOT IN ('adopted','closed')`, [animalId])).rows.length > 0;
    },
    async lockAnimal(animalId: string) {
      return (await query("SELECT id FROM animals WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [animalId])).rows.length > 0;
    },
    async openResponse(animalId: string) {
      return (await query(`SELECT ${columns} FROM veterinary_emergency_responses WHERE animal_id=$1 AND closed_at IS NULL`, [animalId])).rows[0] as EmergencyResponse | undefined;
    },
    async insertResponse(animalId: string, actor: string) {
      return (await query(`INSERT INTO veterinary_emergency_responses
        (animal_id,attending_veterinarian_clerk_user_id,updated_by_clerk_user_id,created_at,updated_at)
        VALUES ($1,$2,$2,clock_timestamp(),clock_timestamp()) RETURNING ${columns}`, [animalId, actor])).rows[0] as EmergencyResponse;
    },
    async updateResponse(current: EmergencyResponse, actor: string, owner: string | null, support: boolean, note: string | null, close = false) {
      return (await query(`UPDATE veterinary_emergency_responses SET
        attending_veterinarian_clerk_user_id=$3, support_required=$4, coordination_note=$5,
        updated_by_clerk_user_id=$6, updated_at=clock_timestamp(), version=version+1,
        closed_at=CASE WHEN $7 THEN clock_timestamp() ELSE NULL END
        WHERE id=$1 AND version=$2 AND closed_at IS NULL RETURNING ${columns}`,
      [current.id, current.version, owner, support, note, actor, close])).rows[0] as EmergencyResponse | undefined;
    },
    async audit(actor: string, action: string, response: EmergencyResponse, previous: EmergencyResponse | undefined) {
      await query(`INSERT INTO audit_logs (actor_clerk_user_id,action,entity_type,entity_id,metadata)
        VALUES ($1,$2,'veterinary_emergency_response',$3,$4::jsonb)`, [actor, action, response.id, JSON.stringify({
        animalId: response.animalId,
        previousVeterinarian: previous?.attendingVeterinarianClerkUserId ?? null,
        attendingVeterinarian: response.attendingVeterinarianClerkUserId,
        previousVersion: previous?.version ?? null, version: response.version,
        previousSupportRequired: previous?.supportRequired ?? false, supportRequired: response.supportRequired,
        previousNote: previous?.coordinationNote ?? null, note: response.coordinationNote,
        closedAt: response.closedAt,
      })]);
    },

  };
}

export type EmergencyStore = ReturnType<typeof createEmergencyStore>;
export type EmergencyTransaction = <T>(work: (store: EmergencyStore) => Promise<T>) => Promise<T>;

export const withEmergencyTransaction: EmergencyTransaction = (work) =>
  withSqlTransaction((query) => work(createEmergencyStore(query)));

export async function listOpenEmergencyResponses(): Promise<(EmergencyResponse & { assistanceAlert?: AssistanceReceipt })[]> {
  const responses = await db.select({ response: veterinaryEmergencyResponses }).from(veterinaryEmergencyResponses)
    .innerJoin(animals, eq(animals.id, veterinaryEmergencyResponses.animalId))
    .where(and(isNull(veterinaryEmergencyResponses.closedAt), eq(animals.veterinaryPriority, "critical"),
      isNull(animals.deletedAt), eq(animals.medicallyCleared, false), not(inArray(animals.status, ["adopted", "closed"]))))
    .then((rows) => rows.map((row) => row.response));
  if (!responses.length) return [];
  const deliveries = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "veterinary_emergency_response"),
    eq(auditLogs.action, "veterinary_assistance_delivery"), inArray(auditLogs.entityId, responses.map((response) => response.id))))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
  return responses.map((response) => ({ ...response,
    assistanceAlert: deliveries.find((entry) => entry.entityId === response.id)?.metadata as AssistanceReceipt | undefined }));
}
