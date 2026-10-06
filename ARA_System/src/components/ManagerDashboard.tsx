import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState, type FormEvent } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";
import { SkeletonLoader } from "./SkeletonLoader";
import { SuccessToast } from "./SuccessToast";

type ManagerDashboardProps = { onNavigate: (view: SiteHeaderView) => void };

type StaffMember = {
  id: string;
  name: string;
  emailAddress: string;
  role: unknown;
  status: "Active";
};

type PendingInvitation = {
  id: string;
  emailAddress: string;
  role: unknown;
  status: "Pending";
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

// The only list of roles a manager/admin can assign, in dropdown order. Both
// the invite form and the per-member role editor render from it, so adding a
// role here is enough on the UI side. Must still stay in sync with staffRoles
// in server/src/modules/staff/staff.service.ts, which is what the API accepts.
const INVITABLE_ROLES: Record<string, string> = {
  staff: "Staff",
  veterinarian: "Veterinarian",
  dispatcher: "Dispatcher",
  manager: "Manager",
  admin: "Admin",
};

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "The SPCA API is not running. Start it with `npm run server:dev`.",
    );
  }
  return (await response.json()) as T;
}

export function ManagerDashboard({ onNavigate }: ManagerDashboardProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [emailAddress, setEmailAddress] = useState("");
  const [role, setRole] = useState("staff");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Single non-blocking success confirmation for invite/role actions (rendered
  // as a corner toast, auto-dismissing). Errors stay inline so the cause is
  // never auto-hidden.
  const [successToastMessage, setSuccessToastMessage] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitation[]
  >([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState("");
  const [staffActionError, setStaffActionError] = useState("");

  const userRole = user?.publicMetadata.role;
  const hasManagerAccess = userRole === "manager" || userRole === "admin";

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasManagerAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        const response = await fetch(`${apiBaseUrl}/api/admin/staff`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await readApiResponse<{
          members?: StaffMember[];
          pendingInvitations?: PendingInvitation[];
          error?: string;
        }>(response);
        if (!response.ok)
          throw new Error(result.error ?? "Staff data could not be loaded.");
        setStaffMembers(result.members ?? []);
        setPendingInvitations(result.pendingInvitations ?? []);
      } catch (error) {
        setStaffError(
          error instanceof Error
            ? error.message
            : "Staff data could not be loaded.",
        );
      } finally {
        setStaffLoading(false);
      }
    })();
  }, [getToken, hasManagerAccess, isLoaded, isSignedIn]);

  async function handleInvitationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setInvitationError("");
    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error(
          "Your Clerk session has expired. Please sign in again.",
        );
      }

      const response = await fetch(`${apiBaseUrl}/api/admin/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emailAddress, role }),
      });
      const result = await readApiResponse<{
        error?: string;
        emailAddress?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(result.error ?? "The invitation could not be created.");
      }

      setSuccessToastMessage(
        `Invitation sent to ${result.emailAddress ?? emailAddress}.`,
      );
      setEmailAddress("");
    } catch (error) {
      setInvitationError(
        error instanceof Error
          ? error.message
          : "The invitation could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function changeMemberRole(member: StaffMember, newRole: string) {
    if (String(member.role) === newRole) return;
    setStaffActionError("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your Clerk session has expired. Please sign in again.");
      }
      const response = await fetch(`${apiBaseUrl}/api/admin/staff/${member.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const result = await readApiResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? "The role could not be updated.");
      }
      setStaffMembers((previous) =>
        previous.map((item) => (item.id === member.id ? { ...item, role: newRole } : item)),
      );
      setSuccessToastMessage(`Role updated for ${member.name}.`);
    } catch (error) {
      setStaffActionError(
        error instanceof Error ? error.message : "The role could not be updated.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function revokeMemberRole(member: StaffMember) {
    const confirmed = window.confirm(
      `Revoke ${member.name}'s staff role? They will keep their account but lose access to the team workspace.`,
    );
    if (!confirmed) return;
    setStaffActionError("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your Clerk session has expired. Please sign in again.");
      }
      const response = await fetch(`${apiBaseUrl}/api/admin/staff/${member.id}/role`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await readApiResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? "The role could not be revoked.");
      }
      setStaffMembers((previous) => previous.filter((item) => item.id !== member.id));
      setSuccessToastMessage(`Revoked ${member.name}'s staff role.`);
    } catch (error) {
      setStaffActionError(
        error instanceof Error ? error.message : "The role could not be revoked.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function revokePendingInvite(invitation: PendingInvitation) {
    const confirmed = window.confirm(
      `Revoke the pending invitation sent to ${invitation.emailAddress}?`,
    );
    if (!confirmed) return;
    setStaffActionError("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your Clerk session has expired. Please sign in again.");
      }
      const response = await fetch(
        `${apiBaseUrl}/api/admin/invitations/${invitation.id}/revoke`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const result = await readApiResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? "The invitation could not be revoked.");
      }
      setPendingInvitations((previous) =>
        previous.filter((item) => item.id !== invitation.id),
      );
      setSuccessToastMessage(`Revoked the invitation for ${invitation.emailAddress}.`);
    } catch (error) {
      setStaffActionError(
        error instanceof Error ? error.message : "The invitation could not be revoked.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Sign in to continue</h1>
          <p>
            Only authenticated users can access the SPCA operations dashboard.
          </p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">
              Log in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (!hasManagerAccess) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Access restricted</h1>
          <p>Your account does not have Manager or Admin permissions.</p>
          <button
            type="button"
            className="teal-button"
            onClick={() => onNavigate("home")}
          >
            Return home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      {successToastMessage && (
        <SuccessToast
          message={successToastMessage}
          onDismiss={() => setSuccessToastMessage("")}
        />
      )}
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="dashboard"
        onNavigate={onNavigate}
      />
      <section className="dashboard-welcome">
        <div>
          <span className="role-pill teal-pill">Manager / Admin</span>
          <p className="eyebrow">Good to see you</p>
          <h2>Keep the rescue network moving.</h2>
          <p>
            Signed in as{" "}
            {user?.primaryEmailAddress?.emailAddress ?? "Clerk user"}. Review
            team access, adoption activity, and today&apos;s operational
            priorities.
          </p>
        </div>
        <div className="dashboard-welcome-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onNavigate("my-profile")}
          >
            My profile
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onNavigate("reports")}
          >
            View reports
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onNavigate("home")}
          >
            Return to public site
          </button>
        </div>
      </section>
      <section className="dashboard-metrics" aria-label="Operations summary">
        <article>
          <span>Staff access accounts</span>
          <strong>
            {staffLoading ? (
              <span className="skeleton-bar skeleton-metric-value" aria-hidden="true" />
            ) : (
              staffMembers.length
            )}
          </strong>
          <small>Loaded from Clerk</small>
        </article>
        <article>
          <span>Pending invitations</span>
          <strong>
            {staffLoading ? (
              <span className="skeleton-bar skeleton-metric-value" aria-hidden="true" />
            ) : (
              pendingInvitations.length
            )}
          </strong>
          <small>Loaded from Clerk</small>
        </article>
      </section>
      <section className="dashboard-grid">
        <div className="dashboard-panel staff-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Access management</p>
              <h2>Staff and roles</h2>
            </div>
            <span className="panel-note">Clerk directory</span>
          </div>
          <div className="staff-list">
            {staffLoading && (
              <SkeletonLoader variant="card" />
            )}
            {!staffLoading && staffError && (
              <p className="dashboard-data-state error">{staffError}</p>
            )}
            {!staffLoading &&
              !staffError &&
              staffMembers.length === 0 &&
              pendingInvitations.length === 0 && (
                <p className="dashboard-data-state">
                  No staff accounts or pending invitations yet.
                </p>
              )}
            {staffActionError && (
              <p className="invite-feedback error">{staffActionError}</p>
            )}
            {!staffLoading &&
              !staffError &&
              staffMembers.map((member) => {
                const managesOwnRow = user?.id === member.id;
                const isAdminOnlyRole =
                  String(member.role) === "manager" ||
                  String(member.role) === "admin";
                const canManage =
                  !managesOwnRow &&
                  (userRole === "admin" || !isAdminOnlyRole) &&
                  !isSubmitting;
                return (
                  <div className="staff-row" key={member.id}>
                    <div className="staff-avatar">
                      {member.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <div className="staff-details">
                      <strong>
                        {member.name}
                        {managesOwnRow ? " (you)" : ""}
                      </strong>
                      <span>{member.emailAddress}</span>
                    </div>
                    <select
                      className="role-select"
                      aria-label={`Role for ${member.name}`}
                      value={String(member.role ?? "")}
                      disabled={!canManage}
                      onChange={(event) =>
                        void changeMemberRole(member, event.target.value)
                      }
                    >
                      {Object.entries(INVITABLE_ROLES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="danger-button small-button"
                      onClick={() => void revokeMemberRole(member)}
                      disabled={!canManage}
                    >
                      Revoke access
                    </button>
                  </div>
                );
              })}
            {!staffLoading &&
              !staffError &&
              pendingInvitations.map((invitation) => (
                <div className="staff-row" key={invitation.id}>
                  <div className="staff-avatar">?</div>
                  <div className="staff-details">
                    <strong>Pending invitation</strong>
                    <span>{invitation.emailAddress}</span>
                  </div>
                  <span className="role-pill muted">
                    {String(invitation.role ?? "Unassigned")}
                  </span>
                  <button
                    type="button"
                    className="danger-button small-button"
                    onClick={() => void revokePendingInvite(invitation)}
                    disabled={isSubmitting}
                  >
                    Revoke
                  </button>
                </div>
              ))}
          </div>
          <p className="security-note">
            Use the dropdown to change a member&apos;s role or revoke their
                    access. Managers can manage staff, veterinarians, and dispatchers;
            only admins can change Manager or Admin roles, and nobody can
            change their own.
          </p>
        </div>
        <div className="dashboard-panel invite-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Team access</p>
              <h2>Invite a staff member</h2>
            </div>
          </div>
          <form className="invite-form" onSubmit={handleInvitationSubmit}>
            <label>
              Email address
              <input
                type="email"
                placeholder="staff@spcafiji.org"
                value={emailAddress}
                onChange={(event) => setEmailAddress(event.target.value)}
                required
              />
            </label>
            <label>
              Assign role
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {Object.entries(INVITABLE_ROLES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="teal-button full-width-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending invitation..." : "Send invitation"}
            </button>
          </form>
          {invitationError && (
            <p className="invite-feedback error">{invitationError}</p>
          )}
          <p className="invite-help">
            Invitations are sent through Clerk after the backend verifies your
            Manager/Admin role.
          </p>
        </div>
      </section>
    </main>
  );
}
