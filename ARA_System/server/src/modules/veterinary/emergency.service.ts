import { z } from "zod";
import { clerkClient } from "../../services/clerkClient.js";
import { listVeterinarianRecipients } from "../notifications/veterinaryAlerts.service.js";
import { notifyRemainingCriticalCases, type AssistanceRecipients } from "../notifications/veterinaryAssistance.service.js";
import { listOpenEmergencyResponses, withEmergencyTransaction, type EmergencyResponse, type EmergencyTransaction } from "./emergency.repository.js";

const expectation = {
  responseId: z.string().uuid().nullable(),
  version: z.number().int().positive().nullable(),
};
export const emergencyActionSchema = z.discriminatedUnion("action", [
  z.object({ ...expectation, action: z.literal("attend") }).strict(),
  z.object({ ...expectation, action: z.literal("release") }).strict(),
  z.object({ ...expectation, action: z.literal("take_over"), handoffConfirmed: z.literal(true), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...expectation, action: z.literal("support"), supportRequired: z.boolean(), note: z.string().trim().max(2000) }).strict(),
]);
export type EmergencyAction = z.infer<typeof emergencyActionSchema>;

export class EmergencyError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const conflict = () => new EmergencyError(409, "Emergency response changed. Refresh the queue and try again.");

export async function coordinateEmergency(animalId: string, action: EmergencyAction, actor: string, transaction: EmergencyTransaction = withEmergencyTransaction, assistance?: AssistanceRecipients) {
  if (!actor) throw new EmergencyError(401, "Authentication is required");
  if (action.action === "support" && action.supportRequired && !action.note.trim()) {
    throw new EmergencyError(400, "Explain the assistance required");
  }
  return transaction(async (store) => {
    // Serialize coordination decisions and assistance delivery across animals.
    // Acquire before the animal lock to keep a consistent lock order.
    await store.query("SELECT pg_advisory_xact_lock(7314,2021)");
    if (!(await store.lockAnimal(animalId))) throw new EmergencyError(404, "Animal not found");
    if (!(await store.activeCritical(animalId))) throw conflict();
    const previous = await store.openResponse(animalId);
    if ((previous?.id ?? null) !== action.responseId || (previous?.version ?? null) !== action.version) throw conflict();
    let next: EmergencyResponse | undefined;
    if (action.action === "attend") {
      if (previous?.attendingVeterinarianClerkUserId) throw conflict();
      next = previous
        ? await store.updateResponse(previous, actor, actor, false, previous.coordinationNote)
        : await store.insertResponse(animalId, actor);
    } else {
      if (!previous?.attendingVeterinarianClerkUserId) throw conflict();
      if (action.action === "take_over") {
        if (previous.attendingVeterinarianClerkUserId === actor) throw conflict();
        next = await store.updateResponse(previous, actor, actor, previous.supportRequired, action.note);
      } else {
        if (previous.attendingVeterinarianClerkUserId !== actor) throw new EmergencyError(403, "Only the attending veterinarian can release responsibility or update support");
        next = action.action === "release"
          ? await store.updateResponse(previous, actor, null, false, previous.coordinationNote)
          : await store.updateResponse(previous, actor, actor, action.supportRequired, action.note || null);
      }
    }
    if (!next) throw conflict();
    await store.audit(actor, `veterinary_emergency_${action.action}`, next, previous);
    if (assistance && action.action === "attend") {
      const assistanceAlert = await notifyRemainingCriticalCases(store.query, next, actor, assistance);
      return { ...next, assistanceAlert };
    }
    return next;
  });
}

// Resolve Clerk recipients before opening a database transaction. A directory
// outage must be reported honestly and must not prevent the vet attending.
export async function coordinateEmergencyWithAssistance(animalId: string, action: EmergencyAction, actor: string,
  dependencies = { transaction: withEmergencyTransaction, recipients: listVeterinarianRecipients,
    name: async (id: string) => { const user = await clerkClient.users.getUser(id); return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Veterinarian"; } }) {
  if (action.action !== "attend") return coordinateEmergency(animalId, action, actor, dependencies.transaction);
  const [recipients, actorName] = await Promise.all([
    dependencies.recipients().catch(() => null), dependencies.name(actor).catch(() => "Veterinarian (name unavailable)"),
  ]);
  return coordinateEmergency(animalId, action, actor, dependencies.transaction, { recipients, actorName });
}

export async function getEmergencyResponses(dependencies = {
  list: listOpenEmergencyResponses,
  resolveNames: async (ids: string[]) => {
    const names = new Map<string, string>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const users = await clerkClient.users.getUserList({ userId: ids.slice(offset, offset + 100), limit: 100 });
      for (const user of users.data) names.set(user.id, [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Veterinarian");
    }
    return names;
  },
}) {
  const responses = await dependencies.list();
  const ids = [...new Set(responses.flatMap((response) => response.attendingVeterinarianClerkUserId ? [response.attendingVeterinarianClerkUserId] : []))];
  // Name lookup failure must not hide ownership or present someone as unassigned.
  const names = await dependencies.resolveNames(ids).catch(() => new Map<string, string>());
  return responses.map((response) => ({ ...response, attendingVeterinarianName: response.attendingVeterinarianClerkUserId
    ? names.get(response.attendingVeterinarianClerkUserId) ?? "Veterinarian (name unavailable)" : null }));
}
