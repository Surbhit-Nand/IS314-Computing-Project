export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
};

// Same base URL / dev-server-not-running guard pattern used in
// adoptionsApi.ts, rescueApi.ts and animalsApi.ts.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The SPCA API is not running. Start it with `npm run server:dev`.");
  }
  return (await response.json()) as T;
}

// Signed-in user: their notification inbox, newest first.
export async function fetchMyNotifications(token: string): Promise<AppNotification[]> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await readApiResponse<AppNotification[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Your notifications could not be loaded.");
  }
  return result as AppNotification[];
}

// Signed-in user: unread count for the header badge.
export async function fetchUnreadNotificationCount(token: string): Promise<number> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await readApiResponse<{ count: number } | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Your notifications could not be loaded.");
  }
  return (result as { count: number }).count;
}

// Signed-in user: mark one notification read (recipient-scoped server-side).
export async function markNotificationRead(token: string, id: string): Promise<AppNotification> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/${id}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await readApiResponse<AppNotification | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The notification could not be updated.");
  }
  return result as AppNotification;
}

// Signed-in user: mark the whole inbox read.
export async function markAllNotificationsRead(token: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/notifications/read-all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await readApiResponse<{ ok: boolean } | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Your notifications could not be updated.");
  }
}
