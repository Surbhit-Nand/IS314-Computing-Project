import { useState } from "react";

// Per-browser "saved animals" list. There is no backend favorites table (and
// none of AGENTS.md's three modules call for one), so this is intentionally
// client-only, persisted in localStorage.
import { useEffect } from "react";
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

// Keep mounted components and other browser tabs in sync after a change.
export function useFavoriteAnimals() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => readFavoriteIds());

  useEffect(() => {
    const sync = () => setFavoriteIds(readFavoriteIds());
    window.addEventListener("storage", sync);
    window.addEventListener("ara:favorites-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("ara:favorites-changed", sync);
    };
  }, []);

  function toggle(animalId: string) {
    const next = readFavoriteIds();
    if (next.has(animalId)) {
      next.delete(animalId);
    } else {
      next.add(animalId);
    }
    writeFavoriteIds(next);
    setFavoriteIds(next);
    window.dispatchEvent(new Event("ara:favorites-changed"));
  }

  return {
    favoriteCount: favoriteIds.size,
    isFavorite: (animalId: string) => favoriteIds.has(animalId),
    toggle,
  };
}
