import { clerkClient } from "../../services/clerkClient.js";
import { normalizeRole } from "../../shared/types/roles.js";
import { withSqlTransaction, type TransactionQuery } from "../../db/transaction.js";
import { createPublicationStore, type PublicationProfile } from "./animalPublication.repository.js";
import { validateNarrativeText } from "./animalFieldRules.js";
import { ensureMissingAnimalSearchEmbedding } from "./animals.service.js";

export class PublicationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function publicationProblem(animal: PublicationProfile): string | null {
  if (animal.deletedAt || ["adopted", "closed"].includes(animal.status)) return "This animal is no longer available for publication.";
  if (!animal.medicallyCleared) return "Medical clearance is required before publication.";
  if (!animal.name.trim() || !animal.description?.trim()) return "Add a name and description before publishing.";
  const narrativeProblem = validateNarrativeText(animal.description, "Description") || validateNarrativeText(animal.behaviour ?? "", "Temperament") || validateNarrativeText(animal.rescueHistory ?? "", "Rescue history");
  if (narrativeProblem) return narrativeProblem;
  if (!animal.photoUrls.length || animal.photoUrls.length > 3 || animal.photoUrls.some((url) => {
    try { return !["http:", "https:"].includes(new URL(url).protocol); } catch { return true; }
  })) return "Choose between one and three valid profile photos before publishing.";
  return null;
}

export type ListingDraft = { description: string; behaviour: string; rescueHistory: string; photoUrls: string[] };

export async function saveAnimalListingDraft(id: string, actor: string, input: ListingDraft, dependencies = {
  access: canPublish, transaction: withSqlTransaction, refreshEmbedding: ensureMissingAnimalSearchEmbedding,
}) {
  if (!await dependencies.access(actor)) throw new PublicationError(403, "Only authorised staff can edit listings.");
  if (typeof input.description !== "string" || typeof input.behaviour !== "string" || input.description.length > 1000 || input.behaviour.length > 1000 || typeof input.rescueHistory !== "string" || input.rescueHistory.length > 1000 ||
      !Array.isArray(input.photoUrls) || input.photoUrls.length > 3 || input.photoUrls.some((url) => {
        try { return typeof url !== "string" || !["http:", "https:"].includes(new URL(url).protocol); } catch { return true; }
      })) throw new PublicationError(400, "Use up to 1,000 characters per field and up to three valid photo URLs.");
  await dependencies.transaction(async (query: TransactionQuery) => {
    const store = createPublicationStore(query);
    const animal = await store.find(id);
    if (!animal) throw new PublicationError(404, "Animal not found");
    if (!animal.medicallyCleared || animal.deletedAt || ["adopted", "closed"].includes(animal.status)) throw new PublicationError(409, "Only medically cleared, active animals can have a listing prepared.");
    // Published profiles must remain complete; unpublished drafts can be unfinished.
    if (animal.publishedAt) {
      const problem = publicationProblem({ ...animal, ...input });
      if (problem) throw new PublicationError(409, problem);
    }
    await store.saveDraft(id, { description: input.description, behaviour: input.behaviour, rescueHistory: input.rescueHistory, photoUrls: input.photoUrls });
  });
  await dependencies.refreshEmbedding(id);
  return { id };
}

async function canPublish(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  return !user.banned && !user.locked && ["staff", "veterinarian", "manager", "admin"].includes(normalizeRole(user.publicMetadata.role) ?? "");
}

export async function publishAnimalProfile(id: string, actor: string, dependencies = {
  access: canPublish, transaction: withSqlTransaction,
}) {
  if (!await dependencies.access(actor)) throw new PublicationError(403, "Only authorised staff can publish animal profiles.");
  return dependencies.transaction(async (query: TransactionQuery) => {
    const store = createPublicationStore(query);
    const animal = await store.find(id);
    if (!animal) throw new PublicationError(404, "Animal not found");
    const problem = publicationProblem(animal);
    if (problem) throw new PublicationError(409, problem);
    if (animal.publishedAt) return { id, publishedAt: animal.publishedAt };
    return store.publish(id, actor);
  });
}
