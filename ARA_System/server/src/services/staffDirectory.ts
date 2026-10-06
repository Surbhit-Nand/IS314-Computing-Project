import { clerkClient } from "../services/clerkClient.js";
import { normalizeRole, staffOrAboveRoles } from "../shared/types/roles.js";

export type StaffContact = {
	clerkUserId: string;
	email: string | null;
	role: string;
};

// Staff-side recipients for operational notifications (new adoption
// applications, ...). Clerk owns identities, so the directory is read live
// from Clerk and filtered to staff-or-above roles - the same accounts that
// can open the review queues. Paginates through the whole user list; SPCA
// scale keeps this to one or two pages. Best-effort by design: callers must
// never fail a business write because the directory lookup failed.
export async function listStaffContacts(): Promise<StaffContact[]> {
	const contacts: StaffContact[] = [];
	const limit = 100;
	let offset = 0;
	for (;;) {
		const page = await clerkClient.users.getUserList({ limit, offset });
		for (const user of page.data) {
			const role = normalizeRole(user.publicMetadata?.role);
			if (!role || !(staffOrAboveRoles as readonly string[]).includes(role)) {
				continue;
			}
			contacts.push({
				clerkUserId: user.id,
				email:
					user.primaryEmailAddress?.emailAddress ??
					user.emailAddresses?.[0]?.emailAddress ??
					null,
				role,
			});
		}
		const total = page.totalCount ?? page.data.length;
		offset += page.data.length;
		if (page.data.length === 0 || offset >= total) break;
	}
	return contacts;
}
