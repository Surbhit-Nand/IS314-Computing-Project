import { useEffect, useState } from "react";
import { fetchBreeds } from "../../services/animalsApi";
import type { FormSpecies } from "../../types/animal";

export type BreedOptions = {
  // The breed list for the current species, or undefined while loading / for
  // "other" (which types its animal type in instead of picking a breed).
  options: string[] | undefined;
  isLoading: boolean;
  error: string;
};

// Loaded lists are kept for the whole session - breeds rarely change, and
// switching Dog <-> Cat back and forth shouldn't refetch each time.
const cache = new Map<"dog" | "cat", string[]>();

// The Breed dropdown's options for a species, loaded from the breeds table
// via GET /api/animals/breeds/:species.
export function useBreedOptions(species: FormSpecies | undefined): BreedOptions {
  const [loaded, setLoaded] = useState<Partial<Record<"dog" | "cat", string[]>>>({});
  const [failed, setFailed] = useState<Partial<Record<"dog" | "cat", string>>>({});

  const needsList = species === "dog" || species === "cat";

  useEffect(() => {
    if (species !== "dog" && species !== "cat") return;
    if (cache.has(species) || loaded[species]) return;

    let cancelled = false;
    fetchBreeds(species)
      .then((breeds) => {
        cache.set(species, breeds);
        if (!cancelled) setLoaded((previous) => ({ ...previous, [species]: breeds }));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed((previous) => ({
            ...previous,
            [species]: error instanceof Error ? error.message : "The breed list could not be loaded.",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [species, loaded]);

  if (!needsList) return { options: undefined, isLoading: false, error: "" };

  const options = cache.get(species) ?? loaded[species];
  const error = options ? "" : (failed[species] ?? "");
  return { options, isLoading: !options && !error, error };
}
