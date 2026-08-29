// DEV-ONLY. Mirrors server/src/config/env.ts's DEV_BYPASS_AUTH: lets a
// developer without Clerk dashboard access see staff-only pages locally
// without a real staff role. Defaults to false/off whenever the variable is
// unset - it only reads VITE_DEV_BYPASS_AUTH from .env.local, which is
// gitignored, so this can't turn on from anything checked into version
// control. The backend still enforces the real check independently (or its
// own matching dev bypass) - this only affects what the UI shows, never
// what the API accepts.
export const isDevBypassEnabled = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";
