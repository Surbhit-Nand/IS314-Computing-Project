import { SignIn, SignUp } from "@clerk/react";
import spcaLogo from "../assets/spca-logo.png";

type AuthPageProps = {
  mode: "login" | "register";
  onNavigate: (view: "home" | "login" | "register" | "dashboard") => void;
};

export function AuthPage({ mode, onNavigate }: AuthPageProps) {
  const isLogin = mode === "login";
  return (
    <main className="auth-view">
      <div className="auth-shell">
        <div className="auth-spotlight">
          <div className="brand-row">
            <img
              src={spcaLogo}
              alt="SPCA Fiji logo"
              className="brand-logo"
            />
          </div>
          <div className="hero-copy">
            <h1>Help animals find safe homes.</h1>
            <p>
              Sign in or create your account to manage adoption applications,
              rescue updates, and community support in one secure portal.
            </p>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <strong>1,248</strong>
              <span>Adoptions</span>
            </div>
            <div className="stat-card">
              <strong>94%</strong>
              <span>Care coverage</span>
            </div>
          </div>
          <ul className="feature-list">
            <li>Rescue intake support</li>
            <li>Adoption access</li>
            <li>Account security</li>
          </ul>
        </div>
        <div className="auth-panel">
          <div className="auth-topbar">
            <button
              type="button"
              className="mini-button"
              onClick={() => onNavigate("home")}
            >
              ← Home
            </button>
          </div>
          <div className="mode-toggle" aria-label="Authentication mode">
            <button
              type="button"
              className={isLogin ? "mode-button active" : "mode-button"}
              onClick={() => onNavigate("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={!isLogin ? "mode-button active" : "mode-button"}
              onClick={() => onNavigate("register")}
            >
              Register
            </button>
          </div>
          <div className="auth-header">
            <p className="eyebrow">User access</p>
            <h2>
              {isLogin ? "Sign in to your account" : "Create your account"}
            </h2>
          </div>
          {isLogin ? <SignIn /> : <SignUp />}
        </div>
      </div>
    </main>
  );
}
