import { useEffect, useState } from "react";
import { fetchBreeds, fetchOtherSpeciesBreeds } from "../../services/animalsApi";
import type { FormSpecies } from "../../types/animal";

export type BreedOptions = {
  // The breed list for the current species: the dog/cat list, or a typed
  // "other" species' list (Rabbit...). An empty array means the species has
  // no list (e.g. Snake) - Breed stays a typed box. Undefined while loading
  // or before an "other" species has been typed.
  options: string[] | undefined;
  // For "other": the breeds table's spelling of the typed species when it has
  // a list ("guinea pig" -> "Guinea Pig"), otherwise undefined.
  listedSpeciesName: string | undefined;
  isLoading: boolean;
  error: string;
};

type LoadedList = { options: string[]; listedSpeciesName: string | undefined };

// Loaded lists are kept for the whole session - breeds rarely change, and
// switching species back and forth shouldn't refetch each time.
const cache = new Map<string, LoadedList>();

// Typed species are matched trimmed, case-insensitive, spaces collapsed.
function cacheKey(species: FormSpecies | "" | undefined, speciesName: string): string | null {
  if (species === "dog" || species === "cat") return species;
  if (species !== "other") return null;
  const typed = speciesName.trim().replace(/\s+/g, " ").toLowerCase();
  return typed ? `other:${typed}` : null;
}

// While staff are still typing an "other" species, wait for a pause before
// asking the server for its list, rather than fetching on every keystroke.
const OTHER_SPECIES_DELAY_MS = 400;

// The Breed dropdown's options for the current species, loaded from the
// breeds table via GET /api/animals/breeds/:species (dog/cat) or
// /breeds/other/:speciesName (typed species).
// No species chosen yet ("") means no list - Breed stays disabled until then.
export function useBreedOptions(species: FormSpecies | "" | undefined, speciesName = ""): BreedOptions {
  const [loaded, setLoaded] = useState<Record<string, LoadedList>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});

  const key = cacheKey(species, speciesName);

  useEffect(() => {
    if (key === null || cache.has(key) || loaded[key]) return;

    let cancelled = false;
    const load = async () => {
      try {
        const list: LoadedList =
          key === "dog" || key === "cat"
            ? { options: await fetchBreeds(key), listedSpeciesName: undefined }
            : await fetchOtherSpeciesBreeds(key.slice("other:".length)).then((result) => ({
                options: result.breeds,
                listedSpeciesName: result.speciesName ?? undefined,
              }));
        cache.set(key, list);
        if (!cancelled) setLoaded((previous) => ({ ...previous, [key]: list }));
      } catch (error: unknown) {
        if (!cancelled) {
          setFailed((previous) => ({
            ...previous,
            [key]: error instanceof Error ? error.message : "The breed list could not be loaded.",
          }));
        }
      }
    };

    const timer = window.setTimeout(load, key.startsWith("other:") ? OTHER_SPECIES_DELAY_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, loaded]);

  if (key === null) return { options: undefined, listedSpeciesName: undefined, isLoading: false, error: "" };

  const list = cache.get(key) ?? loaded[key];
  const error = list ? "" : (failed[key] ?? "");
  return {
    options: list?.options,
    listedSpeciesName: list?.listedSpeciesName,
    isLoading: !list && !error,
    error,
  };
}
