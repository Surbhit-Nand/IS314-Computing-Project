import { useState } from "react";

// Per-browser "saved animals" list. There is no backend favorites table (and
// none of AGENTS.md's three modules call for one), so this is intentionally
// client-only, persisted in localStorage.
const STORAGE_KEY = "ara-favorite-animal-ids";

function readFavoriteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeFavoriteIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private browsing / storage disabled - favoriting just won't persist.
  }
}

// Gives any component a favorited-animal-ids set plus a toggle function.
// Each caller reads its own copy from localStorage on mount; since this app
// has no router and swaps whole pages via view state, every page remounts
// on navigation anyway, so state naturally stays in sync without a shared
// store or event bus.
export function useFavoriteAnimals() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => readFavoriteIds());

  function toggle(animalId: string) {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(animalId)) {
        next.delete(animalId);
      } else {
        next.add(animalId);
      }
      writeFavoriteIds(next);
      return next;
    });
  }

  return {
    isFavorite: (animalId: string) => favoriteIds.has(animalId),
    toggle,
  };
}
