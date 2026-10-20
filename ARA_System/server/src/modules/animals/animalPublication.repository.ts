import type { TransactionQuery } from "../../db/transaction.js";

export type PublicationProfile = {
  id: string; name: string; description: string | null; behaviour: string | null; photoUrls: string[];
  medicallyCleared: boolean; status: string; deletedAt: unknown; publishedAt: unknown;
};

export function createPublicationStore(query: TransactionQuery) {
  return {
    async find(id: string) {
      // Serialise publication with edits, clearance, and adoption of this record.
      const result = await query(`SELECT id,name,description,behaviour,photo_urls AS "photoUrls",
        medically_cleared AS "medicallyCleared",status,deleted_at AS "deletedAt",published_at AS "publishedAt"
        FROM animals WHERE id=$1 FOR UPDATE`, [id]);
      return result.rows[0] as PublicationProfile | undefined;
    },
    async saveDraft(id: string, input: { description: string; behaviour: string; photoUrls: string[] }) {
      await query(`UPDATE animals SET description=$2,behaviour=$3,photo_urls=$4::jsonb,
        search_embedding=NULL,updated_at=clock_timestamp() WHERE id=$1`, [id, input.description, input.behaviour, JSON.stringify(input.photoUrls)]);
    },
    async publish(id: string, actor: string) {
      const result = await query(`UPDATE animals SET published_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE id=$1 RETURNING id,published_at AS "publishedAt"`, [id]);
      await query(`INSERT INTO audit_logs(actor_clerk_user_id,action,entity_type,entity_id,metadata)
        VALUES ($1,'animal_published','animal',$2,'{}'::jsonb)`, [actor, id]);
      await query(`UPDATE notifications SET read_at=COALESCE(read_at,clock_timestamp())
        WHERE entity_type='animal_publication' AND entity_id=$1`, [id]);
      return result.rows[0] as { id: string; publishedAt: string };
    },
  };
}
