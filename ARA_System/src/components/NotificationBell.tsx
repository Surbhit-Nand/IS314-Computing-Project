import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useId, useState } from "react";
import {
  fetchMyNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../services/notificationsApi";
import { notificationTargetView, type NotificationTargetView } from "../utils/notificationTargets";

type NotificationBellProps = {
  onNavigate: (view: NotificationTargetView) => void;
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Header inbox bell for signed-in users. Polls the unread count every minute
// and loads the full list when opened; clicking an item marks it read and
// jumps to the tracking page that shows it (My applications / My reports /
// vet appointments). Failures stay silent inside the dropdown so a down API
// never breaks the header.
export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { getToken } = useAuth();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshCount = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setCount(await fetchUnreadNotificationCount(token));
    } catch {
      // Silent - the badge just keeps its last value.
    }
  }, [getToken]);

  useEffect(() => {
    void (async () => {
      await refreshCount();
    })();
    const timer = setInterval(() => void refreshCount(), 60000);
    return () => clearInterval(timer);
  }, [refreshCount]);

  async function openList() {
    setOpen(true);
    setListLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired.");
      setItems(await fetchMyNotifications(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your notifications could not be loaded.");
    } finally {
      setListLoading(false);
    }
  }

  function closeList() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeList();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open ]);

  async function openNotification(item: AppNotification) {
    try {
      const token = await getToken();
      if (token) await markNotificationRead(token, item.id);
    } catch {
      // The tracking page shows the same state; a failed mark-read is harmless.
    }
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
    setCount((current) => Math.max(0, item.isRead ? current : current - 1));
    closeList();
    onNavigate(notificationTargetView(item.entityType));
  }

  async function markAllRead() {
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired.");
      await markAllNotificationsRead(token);
      setItems((current) => current.map((entry) => ({ ...entry, isRead: true })));
      setCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your notifications could not be updated.");
    }
  }

  return (
    <div className="notif-bell">
      <button
        type="button"
        className="notif-bell-button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => (open ? closeList() : void openList())}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-modal="false" aria-labelledby={headingId}>
          <header className="notif-dropdown-head">
            <h2 id={headingId}>Notifications</h2>
            <div className="notif-dropdown-actions">
              <button type="button" className="mini-button" onClick={() => void markAllRead()}>
                Mark all read
              </button>
              <button
                type="button"
                className="ghost-button modal-close"
                onClick={closeList}
                aria-label="Close notifications"
              >
                ✕
              </button>
            </div>
          </header>

          {listLoading && <p className="dashboard-data-state">Loading…</p>}
          {!listLoading && error && <p className="dashboard-data-state error">{error}</p>}
          {!listLoading && !error && items.length === 0 && (
            <p className="dashboard-data-state">You are all caught up.</p>
          )}
          {!listLoading && !error && items.length > 0 && (
            <ul className="notif-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notif-item${item.isRead ? "" : " unread"}`}
                    onClick={() => void openNotification(item)}
                  >
                    <span className="notif-item-dot" aria-hidden="true" />
                    <span className="notif-item-text">
                      <strong>{item.title}</strong>
                      {item.body && <small>{item.body}</small>}
                      <small className="notif-item-when">{formatWhen(item.createdAt)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
