import { DonateButton } from "../features/donations/DonateButton";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type View =
  | "home"
  | "animal-listings"
  | "about"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "user-dashboard"
  | "rescue-report"
  | "my-reports";

type AboutUsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: "home" | "animal-listings" | "about";
  onNavigate: (view: View) => void;
};

export function AboutUs({ isLoaded, isSignedIn, currentPage, onNavigate }: AboutUsProps) {
  return (
    <div className="home-page">
<SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <section className="about-hero">
          <p className="eyebrow">Who we are</p>
          <h1>About SPCA Fiji</h1>
          <p className="lead-copy">
            We are a registered charity and animal welfare organisation
            dedicated to rescuing, caring for, and rehoming animals across
            Fiji. Our system connects every animal's journey — rescue, care,
            and adoption — so every companion finds a loving home.
          </p>
        </section>

        <section className="about-section">
          <div className="about-text">
            <p className="eyebrow">Our mission</p>
            <h2>Compassion in action, every single day.</h2>
            <p>
              SPCA Fiji works to prevent cruelty, promote responsible
              pet ownership, and provide shelter and care for abandoned and
              surrendered animals. From kittens to senior dogs, every animal
              that comes to us receives veterinary care, a safe place, and a
              second chance.
            </p>
          </div>
          <div className="about-metrics">
            {[
              ["1964", "Serving Fiji since"],
              ["1000+", "Animals rehomed"],
              ["100%", "Donation funded"],
            ].map(([value, label]) => (
              <div className="stat-item" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="about-values">
          <p className="eyebrow">What we stand for</p>
          <h2>Our core values</h2>
          <div className="about-values-grid">
            {[
              ["Compassion", "We treat every animal with kindness and dignity."],
              ["Integrity", "We are transparent and accountable to our supporters."],
              ["Commitment", "We stay by each animal until they are safe and loved."],
              ["Community", "We work hand-in-hand with the people of Fiji."],
            ].map(([title, text]) => (
              <div className="about-value-card" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="about-cta">
          <div>
            <p className="eyebrow">Get involved</p>
            <h2>Help us give every animal a home.</h2>
            <p>
              Volunteer, donate, or adopt — every action makes a difference.
            </p>
          </div>
          <div className="cta-actions">
            <button type="button" className="teal-button" onClick={() => onNavigate("animal-listings")}>
              Meet the animals
            </button>
            <DonateButton className="ghost-button">Donate</DonateButton>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
