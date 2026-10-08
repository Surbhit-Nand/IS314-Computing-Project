import assert from "node:assert/strict";
import { test } from "node:test";
import { createAraHistory, resolveNavigation, views, type AraNavigation, type NavigationDestination, type NavigationSession, type View } from "./araNavigation";
import type { Animal } from "../types/animal";

const anonymous: NavigationSession = { userId: null, role: undefined, devBypass: false };
const session = (role?: string, userId = "user-1"): NavigationSession => ({ userId, role, devBypass: false });
const animal = (id: string): Animal => ({
  id, publicId: id, name: id, type: "dog", breed: null, estimatedAge: null, gender: null,
  colour: null, description: null, rescueDate: null, behaviour: null, rescueHistory: null,
  photoUrls: [], vaccinationStatus: "vaccinated", size: null, veterinaryPriority: null,
  medicallyCleared: true, status: "medically_cleared", createdAt: "", updatedAt: "",
});

// An in-memory browser session history with structured-clone semantics and a
// real event subscription boundary. No React/module mocks or live credentials.
function browser(initial: unknown = { clerk: { flow: "existing" }, other: 42 }) {
  const entries: unknown[] = [structuredClone(initial)];
  let index = 0;
  let pushes = 0;
  let replacements = 0;
  const listeners = new Set<(event: { state: unknown }) => void>();
  const history = {
    get state() { return entries[index]; },
    pushState(state: unknown, title: string, url?: string) {
      assert.equal(title, ""); assert.equal(url, undefined, "URLs must stay unchanged");
      entries.splice(index + 1);
      entries.push(structuredClone(state)); index++; pushes++;
    },
    replaceState(state: unknown, title: string, url?: string) {
      assert.equal(title, ""); assert.equal(url, undefined);
      entries[index] = structuredClone(state); replacements++;
    },
  };
  const host = {
    history,
    addEventListener(name: string, fn: (event: { state: unknown }) => void) { assert.equal(name, "popstate"); listeners.add(fn); },
    removeEventListener(name: string, fn: (event: { state: unknown }) => void) { assert.equal(name, "popstate"); listeners.delete(fn); },
  } as unknown as Parameters<typeof createAraHistory>[0];
  function go(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    index = target;
    listeners.forEach((listener) => listener({ state: structuredClone(history.state) }));
  }
  return { host, entries, go, get pushes() { return pushes; }, get replacements() { return replacements; }, get listenerCount() { return listeners.size; } };
}

test("Home -> About -> Animals -> Rescue restores exact order without pushing on popstate", () => {
  const win = browser(); const nav = createAraHistory(win.host);
  nav.connect(session());
  assert.equal(win.pushes, 0); assert.equal(win.entries.length, 1);
  assert.equal(nav.getSnapshot()?.view, "home");
  for (const view of ["about", "animal-listings", "rescue-report"] as const) nav.navigate({ view });
  assert.equal(win.pushes, 3);
  for (const view of ["animal-listings", "about", "home"]) { win.go(-1); assert.equal(nav.getSnapshot()?.view, view); }
  for (const view of ["about", "animal-listings", "rescue-report"]) { win.go(1); assert.equal(nav.getSnapshot()?.view, view); }
  assert.equal(win.pushes, 3); assert.equal(win.entries.length, 4);
  for (const entry of win.entries) {
    assert.deepEqual((entry as { clerk: unknown }).clerk, { flow: "existing" });
    assert.equal((entry as { other: number }).other, 42);
  }
});

test("profile and adoption entries own their animal, even after visiting another animal", () => {
  const win = browser(); const nav = createAraHistory(win.host); nav.connect(session());
  nav.navigate({ view: "animal-listings" });
  nav.navigate({ view: "animal-profile", viewedAnimal: animal("A") });
  nav.navigate({ view: "adoption-apply", viewedAnimal: animal("A") });
  win.go(-1); assert.equal(nav.getSnapshot()?.view, "animal-profile");
  win.go(1); assert.equal(nav.getSnapshot()?.viewedAnimal?.id, "A");
  nav.navigate({ view: "animal-profile", viewedAnimal: animal("B") });
  win.go(-1); assert.equal(nav.getSnapshot()?.viewedAnimal?.id, "A");
  win.go(-1); assert.equal(nav.getSnapshot()?.viewedAnimal?.id, "A");
  win.go(-1); assert.equal(nav.getSnapshot()?.view, "animal-listings");
  win.go(1); assert.equal(nav.getSnapshot()?.viewedAnimal?.id, "A");
});

test("same logical destination is a no-op; entity and scene changes create entries", () => {
  const win = browser(); const nav = createAraHistory(win.host); nav.connect(session("veterinarian"));
  nav.navigate({ view: "veterinary-dashboard" }); assert.equal(win.pushes, 0);
  const record: NavigationDestination = { view: "veterinary-record", selectedAnimalId: "A", careScene: "history" };
  nav.navigate(record); nav.navigate(record); assert.equal(win.pushes, 1);
  nav.navigate({ ...record, careScene: "assessment" }); assert.equal(win.pushes, 2);
  nav.navigate({ ...record, selectedAnimalId: "B" }); assert.equal(win.pushes, 3);
  win.go(-1); assert.equal(nav.getSnapshot()?.selectedAnimalId, "A");
  assert.equal(nav.getSnapshot()?.careScene, "assessment");
  win.go(-1); assert.equal(nav.getSnapshot()?.careScene, "history");
  win.go(1); assert.equal(nav.getSnapshot()?.careScene, "assessment");
});

const detailFlows: [string, NavigationSession, NavigationDestination, NavigationDestination][] = [
  ["edit animal", session("staff"), { view: "manage-animals" }, { view: "edit-animal", selectedAnimalId: "A" }],
  ["queue record", session("veterinarian"), { view: "veterinary-dashboard" }, { view: "veterinary-record", selectedAnimalId: "A", veterinaryParent: "veterinary-dashboard" }],
  ["history record", session("veterinarian"), { view: "veterinary-records" }, { view: "veterinary-record", selectedAnimalId: "A", veterinaryParent: "veterinary-records" }],
  ["appointment", session("veterinarian"), { view: "vet-appointments" }, { view: "vet-appointment-details", selectedAppointmentId: "appointment-A", veterinaryParent: "vet-appointments" }],
  ["active mission", session("dispatcher"), { view: "rescue-active" }, { view: "rescue-active", rescueMissionId: "mission-A", detailSource: "rescue-active" }],
  ["past mission", session("dispatcher"), { view: "rescue-history" }, { view: "rescue-history", rescueMissionId: "mission-B", detailSource: "rescue-history" }],
];
for (const [name, auth, parent, detail] of detailFlows) {
  test(`${name}: Back restores parent and Forward restores the same entity`, () => {
    const win = browser(); const nav = createAraHistory(win.host); nav.connect(auth);
    nav.navigate(parent); nav.navigate(detail);
    const saved = nav.getSnapshot(); const pushes = win.pushes;
    win.go(-1); assert.deepEqual(nav.getSnapshot(), resolveNavigation(parent, auth));
    win.go(1); assert.deepEqual(nav.getSnapshot(), saved); assert.equal(win.pushes, pushes);
  });
}

test("initial role landings are recorded, explicit Home survives Back and reload", () => {
  for (const [role, view] of [[undefined, "home"], ["staff", "staff-dashboard"], ["dispatcher", "dispatcher-dashboard"], ["rescuer", "dispatcher-dashboard"], ["veterinarian", "veterinary-dashboard"], ["manager", "dashboard"], ["admin", "dashboard"]] as const) {
    const win = browser(); const nav = createAraHistory(win.host); const auth = session(role);
    const disconnect = nav.connect(auth);
    assert.equal(nav.getSnapshot()?.view, view); assert.equal(win.pushes, 0);
    assert.equal((win.host.history.state as { araNavigation: AraNavigation }).araNavigation.view, view);
    nav.navigate({ view: "home" }); nav.navigate({ view: "about" });
    win.go(-1); assert.equal(nav.getSnapshot()?.view, "home");
    disconnect(); const reloaded = createAraHistory(win.host); reloaded.connect(auth);
    assert.equal(reloaded.getSnapshot()?.view, "home");
  }
});

test("anonymous Home -> modal sign-in lands staff once; sign-out and old auth entries are safe", () => {
  const win = browser(); const nav = createAraHistory(win.host);
  let cleanup = nav.connect(anonymous);
  cleanup(); cleanup = nav.connect(session("staff"));
  assert.equal(nav.getSnapshot()?.view, "staff-dashboard"); assert.equal(win.pushes, 0);
  nav.navigate({ view: "home" }); nav.navigate({ view: "animal-listings" });
  win.go(-1); assert.equal(nav.getSnapshot()?.view, "home");
  nav.navigate({ view: "edit-animal", selectedAnimalId: "private" });
  cleanup(); nav.connect(anonymous);
  assert.equal(nav.getSnapshot()?.view, "home");
  win.go(-1); assert.equal(nav.getSnapshot()?.view, "home");
  for (const view of ["login", "register"] as const) {
    const authWin = browser({ araNavigation: { version: 1, ownerUserId: "user-1", view } });
    const authNav = createAraHistory(authWin.host); authNav.connect(session());
    assert.equal(authNav.getSnapshot()?.view, "home"); assert.equal(authWin.pushes, 0);
  }
});

test("StrictMode setup/cleanup/setup keeps one listener and no extra entries", () => {
  const win = browser(); const nav = createAraHistory(win.host);
  const cleanup = nav.connect(session("veterinarian")); cleanup();
  const secondCleanup = nav.connect(session("veterinarian"));
  assert.equal(win.listenerCount, 1); assert.equal(win.entries.length, 1); assert.equal(win.pushes, 0);
  nav.navigate({ view: "home" }); win.go(-1);
  assert.equal(nav.getSnapshot()?.view, "veterinary-dashboard");
  secondCleanup(); assert.equal(win.listenerCount, 0);
  win.go(1); assert.equal(nav.getSnapshot()?.view, "veterinary-dashboard");
});

test("invalid contexts repair to parents, including during popstate without losing Forward", () => {
  const auth = session("veterinarian");
  const cases: [unknown, View][] = [
    [{ view: "animal-profile" }, "animal-listings"], [{ view: "adoption-apply", viewedAnimal: { id: "fake" } }, "animal-listings"],
    [{ view: "edit-animal", selectedAnimalId: "" }, "manage-animals"],
    [{ view: "veterinary-record" }, "veterinary-dashboard"],
    [{ view: "veterinary-record", veterinaryParent: "veterinary-records" }, "veterinary-records"],
    [{ view: "vet-appointment-details", veterinaryParent: "vet-appointments" }, "vet-appointments"],
    [{ view: "rescue-active", detailSource: "rescue-active" }, "rescue-active"],
    [{ view: "unknown" }, "veterinary-dashboard"],
    [null, "veterinary-dashboard"],
  ];
  for (const [input, expected] of cases) assert.equal(resolveNavigation(input, auth).view, expected);
  const win = browser(); const nav = createAraHistory(win.host); nav.connect(auth);
  nav.navigate({ view: "animal-listings" }); nav.navigate({ view: "about" });
  win.entries[1] = { clerk: "keep", araNavigation: { version: 1, ownerUserId: "user-1", view: "animal-profile" } };
  win.go(-1); assert.equal(nav.getSnapshot()?.view, "animal-listings");
  assert.equal((win.host.history.state as { clerk: string }).clerk, "keep");
  win.go(1); assert.equal(nav.getSnapshot()?.view, "about"); assert.equal(win.pushes, 2);
});

test("current Clerk role overrides fabricated history; account changes discard entity context", () => {
  for (const view of ["dashboard", "reports", "edit-animal", "veterinary-record", "vet-appointment-details", "rescue-active"] as const) {
    assert.equal(resolveNavigation({ view, selectedAnimalId: "A", selectedAppointmentId: "B", role: "admin" }, session()).view, "home");
  }
  assert.equal(resolveNavigation({ view: "dashboard" }, { ...session(), devBypass: true }).view, "home");
  const privateAnimal = { ...animal("intake"), medicallyCleared: false };
  assert.equal(resolveNavigation({ view: "animal-profile", viewedAnimal: privateAnimal }, anonymous).view, "animal-listings");
  const win = browser(); const nav = createAraHistory(win.host); const cleanup = nav.connect(session("staff"));
  nav.navigate({ view: "edit-animal", selectedAnimalId: "A" }); cleanup();
  nav.connect(session("staff", "different-user"));
  assert.equal(nav.getSnapshot()?.view, "staff-dashboard"); assert.equal(nav.getSnapshot()?.selectedAnimalId, undefined);
});

test("all 31 views resolve, extraneous UI state is discarded, dispatcher alias deduplicates", () => {
  assert.equal(views.length, 31);
  for (const view of views) assert.ok(views.includes(resolveNavigation({ view }, session("veterinarian")).view));
  assert.deepEqual(resolveNavigation({ view: "animal-listings", search: "dog", selectedAnimalId: "old", form: {} }, anonymous), {
    version: 1, ownerUserId: null, view: "animal-listings",
  });
  const win = browser(); const nav = createAraHistory(win.host); nav.connect(session("dispatcher"));
  nav.navigate({ view: "rescue-board" }); assert.equal(win.pushes, 0);
});

test("a new visit after Back truncates only the forward branch; null history is supported", () => {
  const win = browser(null); const nav = createAraHistory(win.host); nav.connect(anonymous);
  nav.navigate({ view: "about" }); nav.navigate({ view: "animal-listings" });
  win.go(-1); nav.navigate({ view: "rescue-report" }); win.go(1);
  assert.equal(nav.getSnapshot()?.view, "rescue-report"); assert.equal(win.entries.length, 3);
});

test("same-view animal, appointment, and mission visits retain separate identities", () => {
  const cases: [NavigationSession, NavigationDestination, NavigationDestination][] = [
    [session(), { view: "animal-profile", viewedAnimal: animal("A") }, { view: "animal-profile", viewedAnimal: animal("B") }],
    [session("veterinarian"), { view: "vet-appointment-details", selectedAppointmentId: "A" }, { view: "vet-appointment-details", selectedAppointmentId: "B" }],
    [session("dispatcher"), { view: "rescue-active", rescueMissionId: "A", detailSource: "rescue-active" }, { view: "rescue-active", rescueMissionId: "B", detailSource: "rescue-active" }],
  ];
  for (const [auth, a, b] of cases) {
    const win = browser(); const nav = createAraHistory(win.host); nav.connect(auth);
    nav.navigate(a); nav.navigate(b); assert.equal(win.pushes, 2);
    win.go(-1); assert.deepEqual(nav.getSnapshot(), resolveNavigation(a, auth));
    win.go(1); assert.deepEqual(nav.getSnapshot(), resolveNavigation(b, auth));
  }
});

test("all care scenes restore in visit order with the same animal and source", () => {
  const win = browser(); const nav = createAraHistory(win.host); nav.connect(session("veterinarian"));
  const record: NavigationDestination = { view: "veterinary-record", selectedAnimalId: "A", veterinaryParent: "veterinary-records" };
  for (const careScene of ["history", "assessment", "treatments", "clearance"] as const) nav.navigate({ ...record, careScene });
  for (const scene of ["treatments", "assessment", "history"]) {
    win.go(-1); assert.equal(nav.getSnapshot()?.careScene, scene);
    assert.equal(nav.getSnapshot()?.selectedAnimalId, "A");
    assert.equal(nav.getSnapshot()?.veterinaryParent, "veterinary-records");
  }
  for (const scene of ["assessment", "treatments", "clearance"]) { win.go(1); assert.equal(nav.getSnapshot()?.careScene, scene); }
  assert.equal(win.pushes, 4);
});

test("role revocation replaces the current protected page and rejects older protected entries", () => {
  const win = browser(); const nav = createAraHistory(win.host); const cleanup = nav.connect(session("veterinarian"));
  nav.navigate({ view: "veterinary-record", selectedAnimalId: "A" }); cleanup();
  nav.connect(session()); assert.equal(nav.getSnapshot()?.view, "home");
  win.go(-1); assert.equal(nav.getSnapshot()?.view, "home");
  win.go(1); assert.equal(nav.getSnapshot()?.view, "home"); assert.equal(win.pushes, 1);
});

test("repairing an unavailable detail with replace preserves both neighboring visits", () => {
  const win = browser(); const nav = createAraHistory(win.host); nav.connect(session("veterinarian"));
  nav.navigate({ view: "vet-appointments" });
  nav.navigate({ view: "vet-appointment-details", selectedAppointmentId: "deleted", veterinaryParent: "vet-appointments" });
  nav.navigate({ view: "home" }); win.go(-1);
  nav.navigate({ view: "vet-appointments" }, true);
  assert.equal(win.pushes, 3); assert.equal(win.entries.length, 4);
  win.go(1); assert.equal(nav.getSnapshot()?.view, "home");
  win.go(-2); assert.equal(nav.getSnapshot()?.view, "vet-appointments");
});
