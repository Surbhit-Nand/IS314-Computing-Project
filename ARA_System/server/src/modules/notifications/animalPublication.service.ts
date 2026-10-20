import { clerkClient } from "../../services/clerkClient.js";
import { normalizeRole } from "../../shared/types/roles.js";
import { withSqlTransaction, type TransactionQuery } from "../../db/transaction.js";

export async function notifyAnimalReadyToPublish(animalId: string) {
  const recipients: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const users = await clerkClient.users.getUserList({ limit: 100, offset });
    recipients.push(...users.data.filter((user) => !user.banned && !user.locked &&
      ["staff", "manager", "admin"].includes(normalizeRole(user.publicMetadata.role) ?? "")).map((user) => user.id));
    if (!users.data.length || offset + users.data.length >= users.totalCount) break;
  }
  await withSqlTransaction((query) => synchronizePublicationNotifications(query, recipients, animalId));
}

export async function synchronizePublicationNotifications(query: TransactionQuery, recipients: string[], animalId: string) {
    // Row lock serialises publication and notification creation for this animal.
    const animal = (await query(`SELECT id FROM animals WHERE id=$1 AND medically_cleared=true
      AND published_at IS NULL AND deleted_at IS NULL AND status NOT IN ('adopted','closed') FOR UPDATE`, [animalId])).rows[0];
    if (!animal) return;
    for (const recipient of [...new Set(recipients)]) {
      await query(`INSERT INTO notifications(recipient_clerk_user_id,type,title,body,entity_type,entity_id)
        SELECT $1,'animal.ready_to_publish','Animal ready to publish',
          'Medical clearance is complete. Review the existing photos and description, then publish the profile.',
          'animal_publication',$2 WHERE NOT EXISTS (SELECT 1 FROM notifications
            WHERE recipient_clerk_user_id=$1 AND entity_type='animal_publication' AND entity_id=$2)`, [recipient, animalId]);
    }
}
