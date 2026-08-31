import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState, type FormEvent } from "react";
import spcaLogo from "../assets/spca-logo.png";

type ManagerDashboardProps = { onNavigate: (view: "home") => void };

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

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "The ARA API is not running. Start it with `npm run server:dev`.",
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
  const [invitationMessage, setInvitationMessage] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitation[]
  >([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState("");

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
    setInvitationMessage("");
    setInvitationError("");

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

      setInvitationMessage(
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

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">Manager workspace</p>
          <h1>Sign in to continue</h1>
          <p>
            Only authenticated users can access the ARA operations dashboard.
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
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <button
            type="button"
            className="brand-button"
            onClick={() => onNavigate("home")}
          >
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
          </button>
          <div>
            <p className="eyebrow">Operations centre</p>
            <h1>Manager dashboard</h1>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <span className="role-pill">Manager / Admin</span>
          <UserButton />
        </div>
      </header>
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">Good to see you</p>
          <h2>Keep the rescue network moving.</h2>
          <p>
            Signed in as{" "}
            {user?.primaryEmailAddress?.emailAddress ?? "Clerk user"}. Review
            team access, adoption activity, and today&apos;s operational
            priorities.
          </p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onNavigate("home")}
        >
          Return to public site
        </button>
      </section>
      <section className="dashboard-metrics" aria-label="Operations summary">
        <article>
          <span>Staff access accounts</span>
          <strong>{staffLoading ? "..." : staffMembers.length}</strong>
          <small>Loaded from Clerk</small>
        </article>
        <article>
          <span>Pending invitations</span>
          <strong>{staffLoading ? "..." : pendingInvitations.length}</strong>
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
              <p className="dashboard-data-state">
                Loading Clerk staff data...
              </p>
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
            {!staffLoading &&
              !staffError &&
              [...staffMembers, ...pendingInvitations].map((member) => (
                <div className="staff-row" key={member.id}>
                  <div className="staff-avatar">
                    {member.status === "Pending"
                      ? "?"
                      : member.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                  </div>
                  <div className="staff-details">
                    <strong>
                      {member.status === "Pending"
                        ? "Pending invitation"
                        : member.name}
                    </strong>
                    <span>{member.emailAddress}</span>
                  </div>
                  <span className="role-pill muted">
                    {String(member.role ?? "Unassigned")}
                  </span>
                  <span
                    className={
                      member.status === "Pending"
                        ? "status-text pending"
                        : "status-text"
                    }
                  >
                    {member.status}
                  </span>
                </div>
              ))}
          </div>
          <p className="security-note">
            Role changes and invitations will be verified by the backend before
            Clerk is updated.
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
                <option value="staff">Staff</option>
                <option value="veterinarian">Veterinarian</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
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
          {invitationMessage && (
            <p className="invite-feedback success">{invitationMessage}</p>
          )}
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
