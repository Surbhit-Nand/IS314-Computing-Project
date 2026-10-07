// Remembers which animal an anonymous visitor clicked Adopt on, so the
// choice survives the sign-in/register round trip (and a page reload).
// Same-device only: localStorage never leaves the browser, matching how
// `useFavoriteAnimals` already persists saved pets. Nothing here is sent to
// the server - the adoption application itself is still created only by an
// authenticated submit in AdoptionApplicationForm.
const STORAGE_KEY = "ara:pendingAdoption";

// A stashed intent older than this is treated as abandoned, so a week-old
// click can never yank a returning visitor into a form they forgot about.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PendingAdoption = {
  animalId: string;
  savedAt: number;
};

// localStorage is unavailable during some test/prerender environments, so all
// access funnels through here. Without a browser store it falls back to a
// module-level in-memory map: still correct within a session, and it keeps
// the logic (expiry, validation, clearing) testable under node.
const memoryFallback = new Map<string, string>();

function storage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Access itself threw (blocked third-party storage, etc.) - use memory.
  }
  return {
    getItem: (key: string) => (memoryFallback.has(key) ? memoryFallback.get(key)! : null),
    setItem: (key: string, value: string) => {
      memoryFallback.set(key, value);
    },
    removeItem: (key: string) => {
      memoryFallback.delete(key);
    },
  };
}

export function savePendingAdoption(animalId: string): void {
  try {
    const pending: PendingAdoption = { animalId, savedAt: Date.now() };
    storage().setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Private-mode quota errors and the like: the in-memory flow still works
    // for a modal sign-in, so a failed stash must never break the click.
  }
}

// Returns the stashed animal id, or null when there is none, it is expired,
// or it fails validation. `now` is injectable so tests can age a stash.
export function readPendingAdoption(now: number = Date.now()): string | null {
  let raw: string | null;
  try {
    raw = storage().getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAdoption>;
    if (typeof parsed.animalId !== "string" || parsed.animalId === "") return null;
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.animalId;
  } catch {
    return null;
  }
}

export function clearPendingAdoption(): void {
  try {
    storage().removeItem(STORAGE_KEY);
  } catch {
    // Best-effort only, same reasoning as savePendingAdoption.
  }
}
