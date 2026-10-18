export type AppNotification = {
  id: string;
  recipientClerkUserId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actionId: string | null;
  takeoverRequestStatus: "pending" | "approved" | "declined" | "withdrawn" | "cancelled" | null;
  takeoverRequestMissionId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsInbox = {
  items: AppNotification[];
  unreadCount: number;
};
