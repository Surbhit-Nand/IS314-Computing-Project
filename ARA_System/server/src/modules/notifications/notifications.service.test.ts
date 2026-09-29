import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Tests for the notifications service, run without a database. The
// notifications repository is stubbed via node:test's mock.module BEFORE the
// service is imported, following the same pattern as
// modules/adoptions/adoptions.service.test.ts.
//
// Run: node --import tsx --experimental-test-module-mocks --test
//   server/src/modules/notifications/notifications.service.test.ts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => unknown;

const impls = new Map<string, AnyFunction>();

function currentImpl(name: string) {
	const fn = impls.get(name);
	if (!fn) {
		throw new Error(`Unexpected call to unmocked "${name}"`);
	}
	return fn;
}

function moduleMock(specifier: string | URL, exports: Record<string, unknown>) {
	mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
}

moduleMock("./notifications.repository.js", {
	findNotificationsByRecipient: (recipient: string) =>
		currentImpl("findNotificationsByRecipient")(recipient),
	findUnreadNotificationCount: (recipient: string) =>
		currentImpl("findUnreadNotificationCount")(recipient),
	createNotification: (input: unknown) => currentImpl("createNotification")(input),
	markNotificationRead: (id: string, recipient: string) =>
		currentImpl("markNotificationRead")(id, recipient),
	markAllNotificationsRead: (recipient: string) => currentImpl("markAllNotificationsRead")(recipient),
});

// The email leg resolves the recipient address through Clerk and sends via
// the email client. Both are stubbed: clerkEmail controls the resolved
// address (null = no address on file), sentEmails records every send, and
// sendEmailImpl can be swapped per test to simulate a Resend failure.
let clerkEmail: string | null = "applicant@example.com";
const sentEmails: Array<Record<string, unknown>> = [];
let sendEmailImpl: (input: Record<string, unknown>) => Promise<boolean> = async (input) => {
	sentEmails.push(input);
	return true;
};

moduleMock("../../services/clerkClient.js", {
	clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: clerkEmail ? { emailAddress: clerkEmail } : null }) } },
});

moduleMock("../../services/emailClient.js", {
	isEmailConfigured: () => true,
	sendEmail: (input: unknown) => sendEmailImpl(input as Record<string, unknown>),
});

const { getUnreadCount, listMyNotifications, markAllRead, markRead, notifyEmailAddress, notifyUser } = await import(
	"./notifications.service.js"
);

beforeEach(() => {
	impls.clear();
	clerkEmail = "applicant@example.com";
	sentEmails.length = 0;
	sendEmailImpl = async (input) => {
		sentEmails.push(input);
		return true;
	};
});

describe("notifyUser", () => {
	it("creates an unread notification for the recipient", async () => {
		const created: Array<Record<string, unknown>> = [];
		impls.set("createNotification", (input: Record<string, unknown>) => {
			created.push(input);
			return { id: "notif-1", ...input };
		});

		const notification = (await notifyUser({
			recipientClerkUserId: "user_123",
			type: "adoption.status_changed",
			title: "Your application moved to under review",
			body: "Bella (ARA-001)",
			entityType: "adoption_application",
			entityId: "app-1",
		})) as Record<string, unknown>;

		assert.equal(notification.recipientClerkUserId, "user_123");
		assert.equal(notification.isRead, false);
		assert.equal(created.length, 1);
	});

	it("sends an email copy to the recipient's Clerk address", async () => {
		impls.set("createNotification", (input: Record<string, unknown>) => ({ id: "notif-1", ...input }));

		await notifyUser({
			recipientClerkUserId: "user_123",
			type: "adoption.status_changed",
			title: "Your application moved to under review",
			body: "Bella (ARA-001)",
			entityType: "adoption_application",
			entityId: "app-1",
		});

		assert.equal(sentEmails.length, 1);
		assert.equal(sentEmails[0].to, "applicant@example.com");
	});

	it("skips email when the user has no address on file", async () => {
		clerkEmail = null;
		impls.set("createNotification", (input: Record<string, unknown>) => ({ id: "notif-1", ...input }));

		const notification = (await notifyUser({
			recipientClerkUserId: "user_123",
			type: "adoption.status_changed",
			title: "Update",
			entityType: "adoption_application",
			entityId: "app-1",
		})) as Record<string, unknown>;

		assert.equal(notification.id, "notif-1");
		assert.equal(sentEmails.length, 0);
	});

	it("still creates the row when email sending fails", async () => {
		sendEmailImpl = async () => {
			throw new Error("Resend is down");
		};
		impls.set("createNotification", (input: Record<string, unknown>) => ({ id: "notif-1", ...input }));

		const notification = (await notifyUser({
			recipientClerkUserId: "user_123",
			type: "adoption.status_changed",
			title: "Update",
			entityType: "adoption_application",
			entityId: "app-1",
		})) as Record<string, unknown>;

		assert.equal(notification.id, "notif-1");
	});
});

describe("notifyEmailAddress", () => {
	it("sends to the given address with no inbox row", async () => {
		const sent = await notifyEmailAddress({ email: "anon@example.com", title: "Alert resolved" });

		assert.equal(sent, true);
		assert.equal(sentEmails.length, 1);
		assert.equal(sentEmails[0].to, "anon@example.com");
	});

	it("returns false when sending fails", async () => {
		sendEmailImpl = async () => {
			throw new Error("Resend is down");
		};

		assert.equal(await notifyEmailAddress({ email: "anon@example.com", title: "Alert resolved" }), false);
	});
});

describe("listMyNotifications", () => {
	it("scopes the inbox to the session's Clerk id", async () => {
		const seen: string[] = [];
		impls.set("findNotificationsByRecipient", (recipient: string) => {
			seen.push(recipient);
			return [{ id: "notif-1" }];
		});

		const inbox = await listMyNotifications("user_abc");
		assert.deepEqual(inbox, [{ id: "notif-1" }]);
		assert.deepEqual(seen, ["user_abc"]);
	});
});

describe("getUnreadCount", () => {
	it("returns the recipient's unread count", async () => {
		impls.set("findUnreadNotificationCount", () => 3);
		assert.equal(await getUnreadCount("user_abc"), 3);
	});
});

describe("markRead", () => {
	it("returns undefined when the row belongs to another user", async () => {
		impls.set("markNotificationRead", () => undefined);
		assert.equal(await markRead("notif-1", "user_other"), undefined);
	});

	it("returns the row when the recipient owns it", async () => {
		impls.set("markNotificationRead", (id: string, recipient: string) => ({
			id,
			recipientClerkUserId: recipient,
			isRead: true,
		}));
		const row = (await markRead("notif-1", "user_abc")) as Record<string, unknown>;
		assert.equal(row.isRead, true);
	});
});

describe("markAllRead", () => {
	it("marks only the session user's inbox", async () => {
		const seen: string[] = [];
		impls.set("markAllNotificationsRead", (recipient: string) => {
			seen.push(recipient);
		});
		await markAllRead("user_abc");
		assert.deepEqual(seen, ["user_abc"]);
	});
});
