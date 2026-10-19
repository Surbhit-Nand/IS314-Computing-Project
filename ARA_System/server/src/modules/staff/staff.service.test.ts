import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Tests for the staff account/role service, run without a database or a real
// Clerk instance.
//
// Its two dependencies (the Clerk client and the shared audit service) are
// replaced with stubs via node:test's mock.module BEFORE the service is
// imported. The Clerk stub is backed by a `users` Map that individual tests
// populate, so a test can describe a set of Clerk accounts (including accounts
// still carrying the pre-rename `rescuer` role) and assert what the service
// makes of them.
//
// Run: npm test

// The stubs are backed by the `users`/state variables below rather than a
// per-test impl map, so there is no forwarder to declare here.
// Use the namedExports option supported by the installed Node runtime.
function moduleMock(specifier: string | URL, exports: Record<string, unknown>) {
	mock.module(specifier, { namedExports: exports });
}

type StoredUser = {
	id: string;
	firstName?: string | null;
	lastName?: string | null;
	primaryEmailAddress?: { emailAddress: string } | null;
	publicMetadata: { role?: unknown };
};

// The Clerk user list the service reads. Tests swap this wholesale.
let users: StoredUser[] = [];
// Every updateUserMetadata call, so a test can assert the write that happened.
let metadataUpdates: Array<{ userId: string; publicMetadata: Record<string, unknown> }> = [];
// Every audit entry logged, so a test can assert the recorded role change.
let auditEntries: Array<{ action: string; metadata: Record<string, unknown> | undefined }> = [];

function findUser(id: string): StoredUser {
	const found = users.find((candidate) => candidate.id === id);
	if (!found) {
		const error = new Error(`User ${id} not found`) as Error & { status?: number };
		error.status = 404;
		throw error;
	}
	return found;
}

moduleMock("../../services/clerkClient.js", {
	clerkClient: {
		users: {
			getUser: (id: string) => findUser(id),
			getUserList: () => ({ data: users }),
			updateUserMetadata: (userId: string, payload: Record<string, unknown>) => {
				metadataUpdates.push({ userId, publicMetadata: payload.publicMetadata as Record<string, unknown> });
				return Promise.resolve();
			},
		},
		invitations: {
			getInvitationList: () => ({ data: [] }),
			revokeInvitation: () => ({}),
		},
	},
});

moduleMock("../../shared/audit/audit.service.js", {
	logAuditEntry: (entry: { action: string; metadata?: Record<string, unknown> }) => {
		auditEntries.push({ action: entry.action, metadata: entry.metadata });
		return Promise.resolve();
	},
});

const { listStaffAccess, revokeStaffRole, updateStaffRole, staffRoles } = await import("./staff.service.js");
const { normalizeRole } = await import("../../shared/types/roles.js");

// An admin actor, so the permission gate lets the test touch staff/dispatcher
// targets without the "only an admin can change manager/admin" rule getting in
// the way.
const ADMIN_ID = "user_admin";

function staffUser(id: string, role: unknown, firstName = "Pat"): StoredUser {
	return {
		id,
		firstName,
		lastName: "Example",
		primaryEmailAddress: { emailAddress: `${id}@example.com` },
		publicMetadata: role === undefined ? {} : { role },
	};
}

beforeEach(() => {
	users = [staffUser(ADMIN_ID, "admin")];
	metadataUpdates = [];
	auditEntries = [];
});

// The manager UI keeps its own list of assignable roles (INVITABLE_ROLES in
// src/components/ManagerDashboard.tsx) because the frontend can't import from
// server/src. Nothing but a test stops the two lists drifting apart, which
// would show a role in the dropdown that the API then rejects with a 400.
describe("frontend/backend role list parity", () => {
	function frontendInvitableRoles(): string[] {
		const source = readFileSync(
			join(import.meta.dirname, "..", "..", "..", "..", "src", "components", "ManagerDashboard.tsx"),
			"utf8",
		);
		const literal = source.match(/const INVITABLE_ROLES[^=]*=\s*\{([^}]*)\}/);
		assert.ok(literal, "INVITABLE_ROLES object literal not found in ManagerDashboard.tsx");
		return [...literal[1].matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
	}

	it("offers exactly the roles the API accepts", () => {
		assert.deepEqual(
			[...frontendInvitableRoles()].sort(),
			[...staffRoles].sort(),
		);
	});

	it("includes the dispatcher role in both lists", () => {
		assert.ok(frontendInvitableRoles().includes("dispatcher"));
		assert.ok((staffRoles as readonly string[]).includes("dispatcher"));
	});
});

describe("normalizeRole", () => {
	it("resolves the pre-rename rescuer role onto dispatcher", () => {
		assert.equal(normalizeRole("rescuer"), "dispatcher");
	});

	it("passes current role names through unchanged", () => {
		for (const role of ["staff", "veterinarian", "manager", "admin", "dispatcher"]) {
			assert.equal(normalizeRole(role), role);
		}
	});

	it("treats missing and unrecognised values as no role", () => {
		assert.equal(normalizeRole(undefined), undefined);
		assert.equal(normalizeRole(null), undefined);
		assert.equal(normalizeRole(""), undefined);
		assert.equal(normalizeRole("wizard"), undefined);
		assert.equal(normalizeRole(7), undefined);
		assert.equal(normalizeRole({ role: "admin" }), undefined);
	});
});

describe("listStaffAccess", () => {
	it("lists a pre-rename rescuer as a dispatcher instead of hiding them", async () => {
		users.push(staffUser("user_legacy", "rescuer"));

		const { members } = await listStaffAccess();

		const legacy = members.find((member) => member.id === "user_legacy");
		assert.ok(legacy, "a rescuer account must still appear on the staff list");
		assert.equal(legacy.role, "dispatcher");
	});

	it("lists every current staff role", async () => {
		users.push(
			staffUser("user_staff", "staff"),
			staffUser("user_vet", "veterinarian"),
			staffUser("user_manager", "manager"),
			staffUser("user_dispatcher", "dispatcher"),
		);

		const { members } = await listStaffAccess();

		assert.deepEqual(
			members.map((member) => member.role).sort(),
			["admin", "dispatcher", "manager", "staff", "veterinarian"],
		);
	});

	it("omits users with no role or an unrecognised role", async () => {
		users.push(
			staffUser("user_plain", undefined),
			staffUser("user_weird", "wizard"),
			staffUser("user_dispatcher", "dispatcher"),
		);

		const { members } = await listStaffAccess();

		assert.deepEqual(
			members.map((member) => member.id),
			[ADMIN_ID, "user_dispatcher"],
		);
	});
});

describe("revokeStaffRole", () => {
	it("demotes a pre-rename rescuer instead of rejecting them as role-less", async () => {
		users.push(staffUser("user_legacy", "rescuer"));

		const result = await revokeStaffRole(ADMIN_ID, "user_legacy");

		assert.equal(result.role, null);
		assert.deepEqual(metadataUpdates, [{ userId: "user_legacy", publicMetadata: { role: null } }]);
	});

	it("audits the change as coming from the dispatcher role", async () => {
		users.push(staffUser("user_legacy", "rescuer"));

		await revokeStaffRole(ADMIN_ID, "user_legacy");

		assert.equal(auditEntries.length, 1);
		assert.equal(auditEntries[0].action, "staff.role.revoked");
		assert.equal(auditEntries[0].metadata?.fromRole, "dispatcher");
	});

	it("still refuses to revoke an account that has no staff role", async () => {
		users.push(staffUser("user_plain", undefined));

		await assert.rejects(
			() => revokeStaffRole(ADMIN_ID, "user_plain"),
			(error: Error) => {
				assert.ok(error instanceof Error);
				assert.equal((error as Error & { status?: number }).status, 400);
				return true;
			},
		);
		assert.equal(metadataUpdates.length, 0);
	});
});

describe("updateStaffRole", () => {
	it("records the prior role of a pre-rename rescuer as dispatcher", async () => {
		users.push(staffUser("user_legacy", "rescuer"));

		const result = await updateStaffRole(ADMIN_ID, "user_legacy", "staff");

		assert.equal(result.role, "staff");
		assert.deepEqual(metadataUpdates, [{ userId: "user_legacy", publicMetadata: { role: "staff" } }]);
		assert.equal(auditEntries[0].action, "staff.role.updated");
		assert.equal(auditEntries[0].metadata?.fromRole, "dispatcher");
		assert.equal(auditEntries[0].metadata?.toRole, "staff");
	});

	it("keeps the no-self-change rule", async () => {
		await assert.rejects(
			() => updateStaffRole(ADMIN_ID, ADMIN_ID, "staff"),
			(error: Error) => {
				assert.ok(error instanceof Error);
				assert.equal((error as Error & { status?: number }).status, 403);
				return true;
			},
		);
		assert.equal(metadataUpdates.length, 0);
	});

	it("stops a manager from reassigning an admin", async () => {
		users.push(staffUser("user_manager", "manager"), staffUser("user_admin2", "admin"));

		await assert.rejects(
			() => updateStaffRole("user_manager", "user_admin2", "staff"),
			(error: Error) => {
				assert.ok(error instanceof Error);
				assert.equal((error as Error & { status?: number }).status, 403);
				return true;
			},
		);
		assert.equal(metadataUpdates.length, 0);
	});
});
