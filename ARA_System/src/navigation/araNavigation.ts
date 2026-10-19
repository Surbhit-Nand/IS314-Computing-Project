import { z } from "zod";
import type { Animal } from "../types/animal";
import { isDispatcherRole } from "../utils/roles";

export const views = [
  "home", "animal-listings", "about", "animal-profile", "login", "register",
  "dashboard", "staff-dashboard", "dispatcher-dashboard", "rescue-board",
  "rescue-active", "rescue-history", "user-dashboard", "register-animal",
  "manage-animals", "edit-animal", "rescue-report", "rescue-report-phone",
  "my-reports", "manage-rescue-reports", "adoption-apply", "my-applications",
  "my-animals", "my-animal-record", "my-animal-booking", "my-profile",
  "manage-adoption-applications", "reports", "veterinary-dashboard",
  "veterinary-record", "veterinary-records", "vet-appointments", "vet-booking",
  "vet-appointment-details",
] as const;
export type View = typeof views[number];
export type CareScene = "history" | "assessment" | "treatments" | "clearance";
export type VeterinaryParent = "veterinary-dashboard" | "veterinary-records" | "vet-appointments";
export type RescueDetailSource = "rescue-active" | "rescue-history";

export type NavigationDestination = {
  view: View;
  selectedAnimalId?: string;
  viewedAnimal?: Animal;
  selectedAppointmentId?: string;
  veterinaryParent?: VeterinaryParent;
  careScene?: CareScene;
  rescueMissionId?: string;
  detailSource?: RescueDetailSource;
};
export type AraNavigation = NavigationDestination & {
  version: 1;
  // Used only to discard another session's context, never to grant access.
  ownerUserId: string | null;
};
export type NavigationSession = { userId: string | null; role: unknown; devBypass: boolean };
export type NavigateDestination = (destination: NavigationDestination, replace?: boolean) => void;

const id = z.string().trim().min(1);
const nullableText = z.string().nullable();
const animalSchema = z.object({
  id, publicId: z.string(), name: z.string(), type: z.enum(["dog", "cat", "rabbit", "other"]),
  speciesName: nullableText.default(null),
  breed: nullableText, estimatedAge: nullableText, gender: nullableText, colour: nullableText,
  description: nullableText, rescueDate: nullableText, behaviour: nullableText, rescueHistory: nullableText,
  photoUrls: z.array(z.string()), vaccinationStatus: z.enum(["vaccinated", "not_vaccinated"]),
  size: z.enum(["small", "medium", "large", "extra_large"]).nullable(),
  veterinaryPriority: z.enum(["critical", "high", "moderate", "routine"]).nullable(),
  medicallyCleared: z.boolean(), veterinaryStatus: z.string().optional(),
  status: z.enum(["intake", "in_treatment", "medically_cleared", "adopted", "closed"]),
  createdAt: z.string(), updatedAt: z.string(),
});

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function landingView(session: NavigationSession): View {
  if (!session.userId) return "home";
  if (session.role === "manager" || session.role === "admin") return "dashboard";
  if (isDispatcherRole(session.role)) return "dispatcher-dashboard";
  if (session.role === "veterinarian") return "veterinary-dashboard";
  if (session.role === "staff") return "staff-dashboard";
  return "home";
}

// Mirror existing page/API access; Clerk and the server remain authoritative.
export function canVisit(view: View, session: NavigationSession): boolean {
  const { userId, role, devBypass } = session;
  const manager = role === "manager" || role === "admin";
  const staff = devBypass || manager || role === "staff" || role === "veterinarian";
  switch (view) {
    case "dashboard": case "reports": return !!userId && manager;
    case "staff-dashboard": return !!userId && (devBypass || role === "staff" || role === "veterinarian");
    case "dispatcher-dashboard": case "rescue-board": case "rescue-active": case "rescue-history":
      return !!userId && (staff || isDispatcherRole(role));
    case "register-animal": case "manage-animals": case "edit-animal":
    case "manage-adoption-applications": case "manage-rescue-reports": case "rescue-report-phone":
      return !!userId && staff;
    case "veterinary-dashboard": case "veterinary-record": case "veterinary-records":
    case "vet-appointment-details": case "vet-appointments":
      return !!userId && (devBypass || role === "veterinarian");
    case "user-dashboard": case "my-profile": case "my-reports": case "my-applications":
    case "my-animals": case "my-animal-record": case "my-animal-booking": case "vet-booking":
      return !!userId;
    default: return true; // Includes public rescue and the adoption sign-in prompt.
  }
}

// Parse unknown browser data and keep only context meaningful to this view.
// Invalid detail entries become their parent rather than a stale detail screen.
export function resolveNavigation(value: unknown, session: NavigationSession): AraNavigation {
  const input = object(value);
  const parsedView = z.enum(views).safeParse(input.view);
  let view: View = parsedView.success ? parsedView.data : landingView(session);
  if (!canVisit(view, session) || (session.userId && (view === "login" || view === "register"))) {
    view = landingView(session);
  }
  const base = (destination: View): AraNavigation => ({ version: 1, ownerUserId: session.userId, view: destination });
  const next = base(view);
  switch (view) {
    case "animal-profile": case "adoption-apply": {
      const animal = animalSchema.safeParse(input.viewedAnimal);
      if (!animal.success) return base("animal-listings");
      // Staff can open intake profiles; those snapshots must not survive sign-out as public profiles.
      if ((!animal.data.medicallyCleared || animal.data.status === "adopted") && !canVisit("manage-animals", session)) {
        return base("animal-listings");
      }
      return { ...next, viewedAnimal: animal.data };
    }
    case "edit-animal": {
      const selected = id.safeParse(input.selectedAnimalId);
      return selected.success ? { ...next, selectedAnimalId: selected.data } : base("manage-animals");
    }
    case "my-animal-record": case "my-animal-booking": {
      const selected = id.safeParse(input.selectedAnimalId);
      return selected.success ? { ...next, selectedAnimalId: selected.data } : base("my-animals");
    }
    case "veterinary-record": {
      const parent = input.veterinaryParent === "veterinary-records" ? "veterinary-records" : "veterinary-dashboard";
      const selected = id.safeParse(input.selectedAnimalId);
      if (!selected.success) return base(parent);
      const scene = z.enum(["history", "assessment", "treatments", "clearance"]).safeParse(input.careScene);
      return { ...next, selectedAnimalId: selected.data, veterinaryParent: parent, careScene: scene.success ? scene.data : "history" };
    }
    case "vet-appointment-details": {
      const parent = input.veterinaryParent === "vet-appointments" ? "vet-appointments" : "veterinary-dashboard";
      const selected = id.safeParse(input.selectedAppointmentId);
      return selected.success ? { ...next, selectedAppointmentId: selected.data, veterinaryParent: parent } : base(parent);
    }
    case "rescue-active": case "rescue-history": {
      if (input.rescueMissionId === undefined && input.detailSource === undefined) return next;
      const mission = id.safeParse(input.rescueMissionId);
      if (!mission.success || input.detailSource !== view) return next;
      return { ...next, rescueMissionId: mission.data, detailSource: view };
    }
    default: return next;
  }
}

export function sameDestination(a: NavigationDestination, b: NavigationDestination): boolean {
  const logicalView = (view: View) => view === "dispatcher-dashboard" ? "rescue-board" : view;
  return logicalView(a.view) === logicalView(b.view) && a.selectedAnimalId === b.selectedAnimalId &&
    a.viewedAnimal?.id === b.viewedAnimal?.id && a.selectedAppointmentId === b.selectedAppointmentId &&
    a.veterinaryParent === b.veterinaryParent && a.careScene === b.careScene &&
    a.rescueMissionId === b.rescueMissionId && a.detailSource === b.detailSource;
}

type HistoryHost = Pick<Window, "history" | "addEventListener" | "removeEventListener">;
export function createAraHistory(host: HistoryHost) {
  let session: NavigationSession = { userId: null, role: undefined, devBypass: false };
  let snapshot: AraNavigation | null = null;
  let initialized = false;
  let landedForUserId: string | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: AraNavigation) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  function write(next: AraNavigation, replace: boolean) {
    // No URL argument: preserve path, query, and Clerk's hash. Preserve foreign state too.
    const state = { ...object(host.history.state), araNavigation: next };
    if (replace) host.history.replaceState(state, "");
    else host.history.pushState(state, "");
    publish(next);
  }
  function restore(state: unknown) {
    const stored = object(object(state).araNavigation);
    const recognized = stored.version === 1;
    const sameUser = recognized && stored.ownerUserId === session.userId;
    // A different signed-in account must not inherit selected entities from an old session.
    const candidate = recognized && (sameUser || stored.ownerUserId == null) ? stored : { view: landingView(session) };
    let next = resolveNavigation(candidate, session);
    const staffLanding = next.view === "home" && !sameUser && landedForUserId !== session.userId
      ? landingView(session) : null;
    if (staffLanding) next = resolveNavigation({ view: staffLanding }, session);
    landedForUserId = session.userId;
    // Replacement repairs missing/invalid entries and never truncates Forward history.
    write(next, true);
  }
  const popstate = (event: PopStateEvent) => restore(event.state);
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect(nextSession: NavigationSession) {
      const changedUser = initialized && session.userId !== nextSession.userId;
      session = nextSession;
      if (changedUser) landedForUserId = null;
      restore(host.history.state);
      initialized = true;
      host.addEventListener("popstate", popstate);
      return () => host.removeEventListener("popstate", popstate);
    },
    navigate(destination: NavigationDestination, replace = false) {
      const next = resolveNavigation(destination, session);
      if (!replace && snapshot && sameDestination(snapshot, next)) return;
      landedForUserId = session.userId;
      write(next, replace);
    },
  };
}
