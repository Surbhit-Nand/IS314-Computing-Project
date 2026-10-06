import type { AppNotification, NotificationsInbox } from "../types/notification";

// Same base URL / dev-server-not-running guard pattern used in
// adoptionsApi.ts - one shared copy for every notifications reader.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The SPCA API is not running. Start it with `npm run server:dev`.");
  }
  return (await response.json()) as T;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Signed-in user: their own notifications + unread count for the bell badge.
export async function fetchMyNotifications(token: string): Promise<NotificationsInbox> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/mine`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<NotificationsInbox | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "Your notifications could not be loaded.",
    );
  }
  return result as NotificationsInbox;
}

// Signed-in user: mark one own notification read.
export async function markNotificationRead(token: string, id: string): Promise<AppNotification> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<AppNotification | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "The notification could not be updated.",
    );
  }
  return result as AppNotification;
}

// Signed-in user: mark every own notification read (bell "mark all read").
export async function markAllNotificationsRead(token: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/read-all`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<{ ok?: boolean; error?: string }>(response);
  if (!response.ok) {
    throw new Error(result.error ?? "Your notifications could not be updated.");
  }
}
