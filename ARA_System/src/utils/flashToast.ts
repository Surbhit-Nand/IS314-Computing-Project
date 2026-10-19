// Hands a success toast from one page to the page it navigates to - e.g.
// Register / Edit animal -> Manage animal profiles - since navigating
// unmounts the page that showed it. Kept in memory only (this SPA never
// reloads between views): set it just before navigating, and the next page
// peeks at it for its first render and clears it once mounted.

export type FlashToast = { message: string; durationMs: number };

let pending: FlashToast | null = null;

export function setFlashToast(message: string, durationMs = 5000): void {
  pending = { message, durationMs };
}

// Reads without clearing - safe in a useState initialiser, which React may
// call twice in development.
export function peekFlashToast(): FlashToast | null {
  return pending;
}

// Call once the receiving page has mounted, so the toast shows only once.
export function clearFlashToast(): void {
  pending = null;
}
