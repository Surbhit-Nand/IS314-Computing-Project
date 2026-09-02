# User Profile: Picture + Animal Favorites

> **Status:** Planned, not yet implemented. Backend-only scope.
> **Branch:** `dante-feature`
> **Date:** 2026-09-01

## Goals

Extend the user profile with:

1. **Profile picture** — Clerk avatar by default, with an optional Cloudinary-hosted override the user can upload/remove.
2. **Animal favorites** — Users can favorite animals available for adoption, list their favorites, and remove them.

## Decisions

| Question               | Choice                                    |
| ---------------------- | ----------------------------------------- |
| Profile picture source | Clerk default + Cloudinary override       |
| Favorites scope        | Animals only                              |
| Favorites storage      | New `animal_favorites` join table         |
| Implementation scope   | Backend only (schema + API). UI deferred. |

## 1. Database schema (Drizzle)

Add to `server/src/db/schema.ts`:

```ts
// New table: animal_favorites
export const animalFavorites = pgTable(
  "animal_favorites",
  {
    userId: text("user_id").notNull(), // Clerk user id
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.animalId] }),
    animalIdx: index("animal_favorites_animal_idx").on(t.animalId),
  }),
);

// Extend existing users table
export const users = pgTable("users", {
  // ... existing columns ...
  profileImageUrl: text("profile_image_url"), // Cloudinary override; null = use Clerk avatar
  profileImagePublicId: text("profile_image_public_id"), // for Cloudinary deletion
});
```

Migration: `npm run db:generate` → `npm run db:migrate`.

## 2. New module: `server/src/modules/favorites/`

Mirrors the existing module layout (repository / service / routes):

- **`favorites.repository.ts`** — `list(userId)`, `add(userId, animalId)`, `remove(userId, animalId)`, `isFavorited(userId, animalId)`.
- **`favorites.service.ts`** — Validates the animal exists, calls repo, writes audit log entry.
- **`favorites.routes.ts`** — Express router:
  - `GET    /api/favorites` → list current user's favorites (joined with animal data)
  - `POST   /api/favorites/:animalId` → add
  - `DELETE /api/favorites/:animalId` → remove
  - All behind `requireAuth` (Clerk middleware).

Wired into `server/src/app.ts` alongside the other module routers.

## 3. Profile picture (new `profile` module)

Since "user profile" isn't a module yet, add a small **`profile`** module rather than overloading `staff`:

- **`profile.repository.ts`** — `getByUserId(userId)`, `updateImage(userId, url, publicId)`, `clearImage(userId)`.
- **`profile.service.ts`** — Uses existing `cloudinaryClient` to upload/delete. On upload, deletes the previous Cloudinary asset (if any) before storing the new one.
- **`profile.routes.ts`**:
  - `GET   /api/profile/me` → returns `{ userId, profileImageUrl, ... }` (falls back to Clerk avatar URL when `profileImageUrl` is null)
  - `POST  /api/profile/me/avatar` → `multipart/form-data` with `image` field → Cloudinary upload → returns new URL
  - `DELETE /api/profile/me/avatar` → clears the override (falls back to Clerk avatar)

Reuses `multer` (already a dependency) and `cloudinaryClient` (already wired).

## 4. Audit logging

Both new flows call `audit.service.ts` (already exists) with events:

- `favorite.add`, `favorite.remove`
- `profile.avatar.upload`, `profile.avatar.clear`

## 5. Frontend (deferred)

When ready, the UI work would be:

- A `ProfilePage` component with avatar upload + preview.
- A "heart" toggle on `AnimalProfileFields` / animal cards.
- A "My Favorites" view that lists favorited animals.

## 6. Files touched (summary)

**New:**

- `server/src/modules/favorites/favorites.repository.ts`
- `server/src/modules/favorites/favorites.service.ts`
- `server/src/modules/favorites/favorites.routes.ts`
- `server/src/modules/profile/profile.repository.ts`
- `server/src/modules/profile/profile.service.ts`
- `server/src/modules/profile/profile.routes.ts`
- `server/src/db/migrations/0002_*.sql` (generated)

**Modified:**

- `server/src/db/schema.ts` — add `animalFavorites` table + extend `users`
- `server/src/app.ts` — register the two new routers
- `server/src/shared/audit/audit.service.ts` — add new event constants (if not already free-form)

## 7. Open questions to resolve before implementing

1. **Clerk avatar fallback** — should `GET /api/profile/me` resolve the Clerk avatar server-side (via `clerkClient.users.getUser(userId)`) and return it as `profileImageUrl` when no override is set, or just return `null` and let the frontend resolve it from `useUser()`?
2. **Image constraints** — any max file size / allowed MIME types you want enforced (e.g. 5 MB, `image/png|jpeg|webp`)?
3. **Unfavoriting on animal deletion** — already handled via `onDelete: "cascade"` on the FK. Confirm that's the desired behavior.
