import { randomUUID } from "node:crypto";
import { withSqlTransaction, type TransactionQuery } from "../../db/transaction.js";
import { clerkClient } from "../../services/clerkClient.js";
import { normalizeRole } from "../../shared/types/roles.js";
import { closeInactiveEmergencyResponses } from "../veterinary/emergency.lifecycle.js";
import { reconcileVeterinaryAssistance } from "./veterinaryAssistance.service.js";

export type VeterinaryAlertState = { supportIds: string[] };
type Episode = VeterinaryAlertState & { episodeId: string; active: boolean };
// Include old clinical alert types only to retire existing inbox entries;
// new automatic assistance alerts are produced by successful Attend actions.
const activeTypes = ["veterinary.emergency.immediate", "veterinary.emergency.critical", "veterinary.emergency.support"];

type FetchUsers = (offset: number) => Promise<{ data: { id: string; publicMetadata: Record<string, unknown>; banned?: boolean; locked?: boolean }[]; totalCount: number }>;
export async function listVeterinarianRecipients(fetchUsers: FetchUsers = (offset) => clerkClient.users.getUserList({ limit: 100, offset })) {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const users = await fetchUsers(offset);
    ids.push(...users.data.filter((user) => normalizeRole(user.publicMetadata.role) === "veterinarian" && !user.banned && !user.locked).map((user) => user.id));
    if (offset + users.data.length >= users.totalCount || !users.data.length) break;
  }
  return [...new Set(ids)];
}

export async function currentVeterinarySituation(query: TransactionQuery): Promise<VeterinaryAlertState> {
  return (await query(`SELECT COALESCE(jsonb_agg(a.id::text ORDER BY a.id),'[]') AS "supportIds"
    FROM animals a JOIN veterinary_emergency_responses response ON response.animal_id=a.id AND response.closed_at IS NULL
    WHERE a.veterinary_priority='critical' AND a.deleted_at IS NULL AND a.status NOT IN ('adopted','closed')
      AND a.medically_cleared=false AND response.support_required=true`)).rows[0] as VeterinaryAlertState;
}

// Durable episode state lives in existing audit_logs; delivery/read state
// remains in existing notifications. No separate notification tables needed.
export async function synchronizeVeterinaryAlerts(query: TransactionQuery, recipients: string[]) {
  await query("SELECT pg_advisory_xact_lock(7314,2021)");
  await closeInactiveEmergencyResponses(query);
  await reconcileVeterinaryAssistance(query);
  const state = await currentVeterinarySituation(query);
  const rows = await query(`SELECT metadata FROM audit_logs WHERE entity_type='veterinary_emergency_alert'
    AND action='veterinary_alert_state_changed' ORDER BY created_at DESC,id DESC LIMIT 1`);
  const previous = (rows.rows[0] as { metadata: Episode } | undefined)?.metadata;
  const active = state.supportIds.length > 0;
  const copy = { title: "Veterinary Support Required", body: `Support requested for ${state.supportIds.length} Critical animal(s). Review the coordination notes in the Medical Queue.` };
  const episodeId = previous?.active ? previous.episodeId : randomUUID();
  const changed = !previous || previous.active !== active || JSON.stringify(state.supportIds) !== JSON.stringify(previous.supportIds);
  if (!active && !previous?.active) return;
  const meaningful = active && (!previous?.active || state.supportIds.some((id) => !previous.supportIds.includes(id)));
  if (active) {
    if (previous?.active && changed) {
      await query(`UPDATE notifications SET type=$2,title=$3,body=$4,
        read_at=CASE WHEN $5 THEN NULL ELSE read_at END
        WHERE entity_type='veterinary_emergency_alert' AND entity_id=$1 AND type=ANY($6::text[])`,
      [episodeId, "veterinary.emergency.support", copy.title, copy.body, meaningful, activeTypes]);
    }
    // The transaction-wide lock covers check + insert, including simultaneous
    // requests and newly registered vet recipients. Polling never calls this.
    for (const recipient of [...new Set(recipients)]) {
      await query(`INSERT INTO notifications(recipient_clerk_user_id,type,title,body,entity_type,entity_id)
        SELECT $1,$2,$3,$4,'veterinary_emergency_alert',$5
        WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE recipient_clerk_user_id=$1 AND entity_type='veterinary_emergency_alert' AND entity_id=$5)`,
      [recipient, "veterinary.emergency.support", copy.title, copy.body, episodeId]);
    }
  } else {
    await query(`UPDATE notifications SET type='veterinary.emergency.resolved',title='Resolved: '||title,
      body=COALESCE(body,'')||' This emergency situation has ended.',read_at=COALESCE(read_at,clock_timestamp())
      WHERE entity_type='veterinary_emergency_alert' AND entity_id=$1 AND type=ANY($2::text[])`, [episodeId, activeTypes]);
  }
  if (changed) await query(`INSERT INTO audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata,created_at)
    VALUES ('system:veterinary-alerts','veterinary_alert_state_changed','veterinary_emergency_alert',$1,$2::jsonb,clock_timestamp())`,
  [episodeId, JSON.stringify({ ...state, episodeId, active } satisfies Episode)]);
}

export async function refreshVeterinaryAlerts(dependencies = { recipients: listVeterinarianRecipients, transaction: withSqlTransaction }) {
  const recipients = await dependencies.recipients().catch(() => []);
  await dependencies.transaction((query) => synchronizeVeterinaryAlerts(query, recipients));
}
