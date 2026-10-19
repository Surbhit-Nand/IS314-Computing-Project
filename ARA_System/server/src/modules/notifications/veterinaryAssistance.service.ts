import { randomUUID } from "node:crypto";
import type { TransactionQuery } from "../../db/transaction.js";

export type AssistanceRecipients = { recipients: string[] | null; actorName: string };
export type AssistanceReceipt = { status: "sent" | "no_other_vets" | "unavailable" | "not_needed"; recipientCount: number; waitingAnimalIds: string[] };
type WaitingAnimal = { id: string; name: string; publicId: string };
type AssistanceEpisode = { episodeId: string; active: boolean; waitingAnimalIds: string[] };

async function waitingCritical(query: TransactionQuery) {
  return (await query(`SELECT a.id,a.name,a.public_id AS "publicId"
    FROM animals a
    LEFT JOIN veterinary_emergency_responses response ON response.animal_id=a.id AND response.closed_at IS NULL
    WHERE a.veterinary_priority='critical' AND a.deleted_at IS NULL AND a.medically_cleared=false
      AND a.status NOT IN ('adopted','closed') AND response.attending_veterinarian_clerk_user_id IS NULL
    ORDER BY a.id`)).rows as WaitingAnimal[];
}

function waitingCopy(animals: WaitingAnimal[]) {
  return animals.map((animal) => `${animal.name} (${animal.publicId}) remains Critical and is awaiting a veterinarian. Veterinary attention and coordinated assistance are required.`).join("\n");
}

async function previousEpisode(query: TransactionQuery) {
  return (await query(`SELECT metadata FROM audit_logs WHERE entity_type='veterinary_emergency_assistance'
    AND action='veterinary_assistance_state' ORDER BY created_at DESC,id DESC LIMIT 1`)).rows[0] as { metadata: AssistanceEpisode } | undefined;
}

// Called only within the existing backend write transaction/alert lock, never
// by inbox or queue polling. Read state stays in the existing notification rows.
export async function reconcileVeterinaryAssistance(query: TransactionQuery) {
  const previous = (await previousEpisode(query))?.metadata;
  if (!previous?.active) return;
  const waiting = await waitingCritical(query);
  if (waiting.length) {
    await query(`UPDATE notifications SET body=split_part(body,E'\\n',1)||E'\\n'||$2 WHERE entity_type='veterinary_emergency_alert'
      AND entity_id=$1 AND type='veterinary.emergency.assistance'`, [previous.episodeId,
      `Critical cases still awaiting veterinary attention:\n${waitingCopy(waiting)}\nDelivery does not mean assistance has been accepted. Coordinate care or emergency referral when necessary.`]);
    return;
  }
  await query(`UPDATE notifications SET type='veterinary.emergency.resolved',title='Resolved: Veterinary assistance request',
    body='No active Critical animals remain unassigned. Clinical priorities and urgency are unchanged.',read_at=COALESCE(read_at,clock_timestamp())
    WHERE entity_type='veterinary_emergency_alert' AND entity_id=$1 AND type='veterinary.emergency.assistance'`, [previous.episodeId]);
  await query(`INSERT INTO audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata,created_at)
    VALUES ('system:veterinary-alerts','veterinary_assistance_state','veterinary_emergency_assistance',$1,$2::jsonb,clock_timestamp())`,
  [previous.episodeId, JSON.stringify({ ...previous, active: false, waitingAnimalIds: [] })]);
}

export async function notifyRemainingCriticalCases(query: TransactionQuery,
  response: { id: string; animalId: string }, actor: string, delivery: AssistanceRecipients): Promise<AssistanceReceipt> {
  await reconcileVeterinaryAssistance(query);
  const waiting = await waitingCritical(query);
  const recipients = [...new Set(delivery.recipients ?? [])].filter((id) => id !== actor);
  const receipt: AssistanceReceipt = { status: !waiting.length ? "not_needed" : delivery.recipients === null ? "unavailable" : recipients.length ? "sent" : "no_other_vets",
    recipientCount: waiting.length ? recipients.length : 0, waitingAnimalIds: waiting.map((animal) => animal.id) };
  if (waiting.length) {
    const previous = (await previousEpisode(query))?.metadata;
    const episodeId = previous?.active ? previous.episodeId : randomUUID();
    const attended = (await query(`SELECT name,public_id AS "publicId" FROM animals WHERE id=$1`, [response.animalId])).rows[0] as { name: string; publicId: string };
    const body = `${delivery.actorName} confirmed attendance for ${attended.name} (${attended.publicId}).\n${waitingCopy(waiting)}\nPlease review the Medical Queue and coordinate additional care or emergency referral when necessary. Delivery does not mean assistance has been accepted.`;
    for (const recipient of recipients) {
      // The surrounding coordination transaction holds the same global advisory
      // lock as alert reconciliation. One notification per recipient per episode.
      await query(`UPDATE notifications SET title='URGENT: VETERINARY ASSISTANCE REQUIRED',body=$3,read_at=NULL
        WHERE recipient_clerk_user_id=$1 AND entity_type='veterinary_emergency_alert' AND entity_id=$2 AND body IS DISTINCT FROM $3`, [recipient, episodeId, body]);
      await query(`INSERT INTO notifications(recipient_clerk_user_id,type,title,body,entity_type,entity_id)
        SELECT $1,'veterinary.emergency.assistance','URGENT: VETERINARY ASSISTANCE REQUIRED',$3,'veterinary_emergency_alert',$2
        WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE recipient_clerk_user_id=$1 AND entity_type='veterinary_emergency_alert' AND entity_id=$2)`, [recipient, episodeId, body]);
    }
    await query(`INSERT INTO audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata,created_at)
      VALUES ($1,'veterinary_assistance_state','veterinary_emergency_assistance',$2,$3::jsonb,clock_timestamp())`,
    [actor, episodeId, JSON.stringify({ episodeId, active: true, waitingAnimalIds: receipt.waitingAnimalIds })]);
  }
  await query(`INSERT INTO audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata,created_at)
    VALUES ($1,'veterinary_assistance_delivery','veterinary_emergency_response',$2,$3::jsonb,clock_timestamp())`, [actor, response.id, JSON.stringify(receipt)]);
  return receipt;
}
