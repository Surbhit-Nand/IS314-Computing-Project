import { useEffect, useId, useRef, useState } from "react";
import { fetchMyNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notificationsApi";
import type { AppNotification, NotificationsInbox } from "../types/notification";
import { IconCheck, IconClipboard, IconActivity } from "./MedicalIcons";
import "./NotificationBell.css";

type Props = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  getToken: () => Promise<string | null>;
  isVeterinarian: boolean;
  onOpen: (entityType: string | null, item?: AppNotification) => void;
};

// The existing bell, shared by public/team headers and the veterinary sidebar.
export function NotificationBell({ isLoaded, isSignedIn, getToken, isVeterinarian, onOpen }: Props) {
  // Shared account inbox. Reads/polling never generate emergency alerts.
  const [inbox, setInbox] = useState<NotificationsInbox | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [markingRead, setMarkingRead] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const inboxId = useId();
  const visibleNotifications = (inbox?.items ?? []).filter((item) => (isVeterinarian || item.entityType !== "veterinary_emergency_alert") && (!unreadOnly || !item.readAt));

  useEffect(() => {
    if (!bellOpen) return;
    bellRef.current?.querySelector<HTMLElement>('[role="dialog"]')?.focus();
    const dismiss = (event: MouseEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) setBellOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setBellOpen(false);
      bellRef.current?.querySelector<HTMLButtonElement>(".notification-bell")?.focus();
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [bellOpen]);

  useEffect(() => {
    // The bell only renders for signed-in sessions, so nothing needs clearing
    // on sign-out - the next sign-in overwrites the inbox below.
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    async function loadInbox() {
      setInboxLoading(true);
      try {
        const token = await getToken();
        if (cancelled) return;
        if (!token) throw new Error("Session unavailable");
        const data = await fetchMyNotifications(token);
        if (!cancelled) { setInbox(data); setInboxError(""); }
      } catch {
        if (!cancelled) setInboxError("Notifications could not be refreshed. Please try again shortly.");
      } finally {
        if (!cancelled) setInboxLoading(false);
      }
    }
    void loadInbox();
    const timer = window.setInterval(() => void loadInbox(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [getToken, isLoaded, isSignedIn, bellOpen, isVeterinarian]);

  async function handleMarkAllRead() {
    setMarkingRead(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Session unavailable");
      await markAllNotificationsRead(token);
      setInboxError("");
      setInbox((previous) =>
        previous
          ? { items: previous.items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })), unreadCount: 0 }
          : previous,
      );
    } catch {
      setInboxError("Could not mark notifications as read. Please try again.");
    } finally { setMarkingRead(false); }
  }

  async function handleOpenNotification(item: AppNotification) {
    const { id, entityType } = item;
    setBellOpen(false);
    try {
      const token = await getToken();
      if (!token) return;
      await markNotificationRead(token, id);
      setInbox((previous) =>
        previous
          ? {
              items: previous.items.map((item) =>
                item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
              ),
              unreadCount: Math.max(0, previous.unreadCount - (previous.items.some((item) => item.id === id && !item.readAt) ? 1 : 0)),
            }
          : previous,
      );
    } catch {
      // Read state syncs on the next poll.
    }
    onOpen(entityType, item);
  }
  return (<div className="notification-bell-wrap" ref={bellRef}>
              <button
                type="button"
                className={`notification-bell notification-bell-minimal${inbox?.items.some((item) => isVeterinarian && ["veterinary.emergency.immediate", "veterinary.emergency.assistance"].includes(item.type) && !item.readAt) ? " has-emergency" : ""}`}
                onClick={() => setBellOpen((open) => !open)}
                aria-label={inbox && inbox.unreadCount > 0 ? `Notifications, ${inbox.unreadCount} unread` : "Notifications"}
                aria-expanded={bellOpen}
                aria-haspopup="dialog"
                aria-controls={bellOpen ? inboxId : undefined}
              >
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a1 1 0 0 1 1 1v.08A6 6 0 0 1 18 9v3.5l2.3 3.45A1.3 1.3 0 0 1 19.22 18H4.78a1.3 1.3 0 0 1-1.08-2.05L6 12.5V9a6 6 0 0 1 5-5.92V3a1 1 0 0 1 1-1Zm-2 18h4a2 2 0 0 1-4 0Z" />
                </svg>
                {inbox && inbox.unreadCount > 0 && (
                  <span className="notification-badge" aria-hidden="true">
                    {inbox.unreadCount > 9 ? "9+" : inbox.unreadCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="notification-panel" id={inboxId} role="dialog" tabIndex={-1} aria-labelledby={`${inboxId}-title`}>
                  <div className="notification-panel-head">
                    <div><strong id={`${inboxId}-title`}>Notifications</strong><p>{inbox ? (inbox.unreadCount ? `${inbox.unreadCount} unread updates` : "You're up to date") : "Your latest account updates"}</p></div>
                    <button type="button" className="notification-close" aria-label="Close notifications" onClick={() => { setBellOpen(false); bellRef.current?.querySelector<HTMLButtonElement>(".notification-bell")?.focus(); }}>×</button>
                  </div>
                  <div className="notification-toolbar">
                    <div role="group" aria-label="Filter notifications"><button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button><button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread</button></div>
                    {!!inbox?.unreadCount && <button type="button" className="notification-mark-read" disabled={markingRead} onClick={() => void handleMarkAllRead()}><IconCheck size={14} />{markingRead ? "Updating…" : "Mark all read"}</button>}
                  </div>
                  {inboxError && <p className="notification-error" role="alert">{inboxError}</p>}
                  {inboxLoading && !inbox ? <p className="notification-empty" role="status">Loading notifications…</p> : !inboxError && visibleNotifications.length === 0 ? (
                    <div className="notification-empty"><span className="notification-empty-icon"><IconCheck size={24} /></span><strong>{unreadOnly ? "All caught up" : "No notifications yet"}</strong><p>{unreadOnly ? "You've read all your updates." : "Updates about your applications will appear here."}</p></div>
                  ) : (
                    <ul className="notification-list">
                      {visibleNotifications.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`notification-item${item.readAt ? "" : " unread"}${item.entityType === "veterinary_emergency_alert" ? " veterinary-alert" : ""}${["veterinary.emergency.immediate", "veterinary.emergency.assistance"].includes(item.type) ? " immediate-alert" : ""}`}
                            onClick={() => void handleOpenNotification(item)}
                          >
                            <span className="notification-message-icon" aria-hidden="true">{item.entityType === "veterinary_emergency_alert" ? <IconActivity size={18} /> : <IconClipboard size={18} />}</span>
                            <span className="notification-message-copy">
                            <span className="notification-item-title">{item.title}{!item.readAt && <span className="notification-unread-dot" aria-label="Unread" />}</span>
                            {item.body && <span className="notification-item-body">{item.body}</span>}
                            {item.entityType === "veterinary_emergency_alert" && <span className="notification-emergency-action">View Emergency Queue ?</span>}
                            <span className="notification-item-time">
                              {new Date(item.createdAt).toLocaleString(undefined, {
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                                timeZone: "Pacific/Fiji",
                              })}
                            </span>
                            {item.type.startsWith("rescue.takeover_") && <span className="notification-emergency-action">{item.takeoverRequestStatus === "pending" ? "Review request" : item.takeoverRequestStatus === "approved" ? "Approved" : item.takeoverRequestStatus === "declined" ? "Declined" : item.takeoverRequestStatus === "withdrawn" ? "Withdrawn" : "View rescue update"}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>);
}
