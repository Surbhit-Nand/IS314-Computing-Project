import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { Breadcrumbs } from "./Breadcrumbs";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";
import { SuccessToast } from "./SuccessToast";
import "./MyProfilePage.css";

type MyProfilePageProps = {
  onNavigate: (view: SiteHeaderView) => void;
};

// Clerk throws structured API errors ({ errors: [{ message }] }) - surface
// the first message instead of a generic fallback.
function clerkMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const details = (error as { errors?: Array<{ message?: string }> }).errors;
    if (details?.[0]?.message) return details[0].message;
    if (error.message) return error.message;
  }
  return fallback;
}

// In-app editor for the signed-in user's own Clerk profile: display name,
// avatar photo, and email addresses (with verification for new ones). Roles
// are deliberately excluded - they stay manager/admin-managed through the
// staff module, so nobody can self-promote. Past denormalized copies
// (reporter/dispatcher names on history rows) keep their old values; only
// live session reads change.
export function MyProfilePage({ onNavigate }: MyProfilePageProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [pendingEmailId, setPendingEmailId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [toast, setToast] = useState("");

  // Seed the name fields from the Clerk user once it hydrates (and if the
  // account changes underneath us). Done during render - not in an effect -
  // and guarded by account id so saving a new name never wipes the fields.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
  }

  // Revoke the object URL when the preview is replaced or unmounted.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  if (!isLoaded || !isSignedIn || !user) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">Your SPCA account</p>
          <h1>Sign in to continue</h1>
          <p>Log in to view and update your profile.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">
              Log in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  async function saveName() {
    if (!user) return;
    setNameSaving(true);
    setNameError("");
    try {
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      });
      setToast("Your name was updated.");
    } catch (error) {
      setNameError(clerkMessage(error, "Your name could not be updated."));
    } finally {
      setNameSaving(false);
    }
  }

  function handlePhotoSelected(file: File | undefined) {
    setPhotoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file.");
      return;
    }
    // Same 8 MB ceiling as animal photo uploads (animals.routes.ts).
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError("The photo must be 8 MB or smaller.");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    setPendingPhotoFile(file);
  }

  async function savePhoto() {
    if (!user) return;
    if (!pendingPhotoFile) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      await user.setProfileImage({ file: pendingPhotoFile });
      setPendingPhotoFile(null);
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
      }
      setToast("Your profile photo was updated.");
    } catch (error) {
      setPhotoError(clerkMessage(error, "Your photo could not be uploaded."));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function addEmail() {
    if (!user) return;
    const address = newEmail.trim();
    if (!address) {
      setEmailError("Enter an email address.");
      return;
    }
    setEmailBusy(true);
    setEmailError("");
    try {
      const created = await user.createEmailAddress({ email: address });
      await created.prepareVerification({ strategy: "email_code" });
      setPendingEmailId(created.id);
      setVerificationCode("");
      setToast(`A verification code was sent to ${address}.`);
    } catch (error) {
      setEmailError(clerkMessage(error, "That email address could not be added."));
    } finally {
      setEmailBusy(false);
    }
  }

  async function verifyEmail() {
    if (!user) return;
    if (!pendingEmailId || !verificationCode.trim()) {
      setEmailError("Enter the verification code.");
      return;
    }
    setEmailBusy(true);
    setEmailError("");
    try {
      const pending = user.emailAddresses.find((entry) => entry.id === pendingEmailId);
      if (!pending) throw new Error("That pending address is no longer here - add it again.");
      await pending.attemptVerification({ code: verificationCode.trim() });
      setPendingEmailId(null);
      setVerificationCode("");
      setNewEmail("");
      setToast("Your email address was verified.");
    } catch (error) {
      setEmailError(clerkMessage(error, "The code was not accepted - try again."));
    } finally {
      setEmailBusy(false);
    }
  }

  async function makePrimary(id: string) {
    if (!user) return;
    setEmailBusy(true);
    setEmailError("");
    try {
      await user.update({ primaryEmailAddressId: id });
      setToast("Your primary email address was updated.");
    } catch (error) {
      setEmailError(clerkMessage(error, "The primary address could not be changed."));
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div className="home-page account-profile-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="my-profile"
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <Breadcrumbs
          trail={[{ label: "Home", onClick: () => onNavigate("home") }, { label: "My profile" }]}
        />

        <section className="catalog-hero">
          <p className="eyebrow">Your SPCA account</p>
          <h1>My profile</h1>
          <p className="lead-copy">
            Manage your name, photo and sign-in details.
          </p>
        </section>

        <div className="account-profile-layout">
          <aside className="account-profile-summary">
            <img src={user.imageUrl} alt="" className="account-profile-avatar" />
            <h2>{user.fullName || user.firstName || "Your account"}</h2>
            <p>{user.primaryEmailAddress?.emailAddress}</p>
            <span className="chip">SPCA Fiji account</span>
            <nav aria-label="Profile sections">
              <a href="#profile-name">Personal details <span aria-hidden="true">↗</span></a>
              <a href="#profile-photo">Profile photo <span aria-hidden="true">↗</span></a>
              <a href="#profile-emails">Email &amp; sign-in <span aria-hidden="true">↗</span></a>
            </nav>
            <small>Saved changes update your account across the app.</small>
          </aside>
        <div className="profile-sections">
          <section id="profile-name" className="dashboard-panel" aria-label="Display name">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Profile</p>
                <h2>Display name</h2>
              </div>
            </div>
            <div className="profile-form-grid">
              <label>
                First name
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                />
              </label>
            </div>
            {nameError && <p className="invite-feedback error">{nameError}</p>}
            <button
              type="button"
              className="teal-button small-button"
              onClick={() => void saveName()}
              disabled={nameSaving}
            >
              {nameSaving ? "Saving…" : "Save name"}
            </button>
          </section>

          <section id="profile-photo" className="dashboard-panel" aria-label="Profile photo">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Profile</p>
                <h2>Photo</h2>
              </div>
            </div>
            <div className="profile-photo-row">
              <img
                src={photoPreview ?? user.imageUrl}
                alt="Your profile photo"
                className="profile-photo-preview"
              />
              <div>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Choose a new profile photo"
                  onChange={(event) => handlePhotoSelected(event.target.files?.[0])}
                  disabled={photoSaving}
                />
                <p className="security-note">Image file, 8 MB or smaller.</p>
              </div>
            </div>
            {photoError && <p className="invite-feedback error">{photoError}</p>}
            <button
              type="button"
              className="teal-button small-button"
              onClick={() => void savePhoto()}
              disabled={photoSaving || !pendingPhotoFile}
            >
              {photoSaving ? "Uploading…" : "Save photo"}
            </button>
          </section>

          <section id="profile-emails" className="dashboard-panel" aria-label="Email addresses">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Profile</p>
                <h2>Email addresses</h2>
              </div>
            </div>
            <ul className="profile-email-list">
              {user.emailAddresses.map((entry) => {
                const isPrimary = user.primaryEmailAddressId === entry.id;
                const isVerified = entry.verification?.status === "verified";
                return (
                  <li key={entry.id} className="profile-email-row">
                    <span>
                      <strong>{entry.emailAddress}</strong>{" "}
                      {isPrimary && <span className="chip">Primary</span>}{" "}
                      {!isVerified && <span className="chip">Unverified</span>}
                    </span>
                    {!isPrimary && isVerified && (
                      <button
                        type="button"
                        className="mini-button"
                        onClick={() => void makePrimary(entry.id)}
                        disabled={emailBusy}
                      >
                        Make primary
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="profile-form-grid">
              <label>
                Add an email address
                <input
                  type="email"
                  value={newEmail}
                  onChange={(event) => {
                    setNewEmail(event.target.value);
                    setPendingEmailId(null);
                  }}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
            </div>
            {pendingEmailId && (
              <div className="profile-form-grid">
                <label>
                  Verification code
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter the code from your inbox"
                  />
                </label>
              </div>
            )}
            {emailError && <p className="invite-feedback error">{emailError}</p>}
            <div className="profile-actions-row">
              {!pendingEmailId ? (
                <button
                  type="button"
                  className="teal-button small-button"
                  onClick={() => void addEmail()}
                  disabled={emailBusy}
                >
                  {emailBusy ? "Sending…" : "Add email"}
                </button>
              ) : (
                <button
                  type="button"
                  className="teal-button small-button"
                  onClick={() => void verifyEmail()}
                  disabled={emailBusy}
                >
                  {emailBusy ? "Verifying…" : "Verify code"}
                </button>
              )}
            </div>
            <p className="security-note">
              New addresses need a verification code before they can sign you in.
            </p>
          </section>
        </div>
        </div>
      </main>

      <SiteFooter />
      {toast && <SuccessToast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
