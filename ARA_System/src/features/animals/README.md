# Animal profile and listing UI

This directory contains the implemented animal profile, staff management, and
public listing pages. `AnimalListings.tsx` calls `src/services/animalsApi.ts`
with the existing natural-language query, then renders its loaded public animal
cards in the backend's ranked ID order. Sidebar filters narrow that result set;
zero matches stay empty and Clear all restores normal listing.

Intent parsing, embedding, visibility, and database ranking belong to the backend.
See [hybrid search documentation](../../../server/README.md).
