import { useState } from "react";
import { DonateModal } from "../features/donations/DonateModal";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

// About page hero background - a single static image, full-width and sized
// to match the homepage slideshow banner.
const ABOUT_HERO_IMAGE =
  "https://t4.ftcdn.net/jpg/02/17/89/41/360_F_217894165_H4jRalQ4eg9Kp8XUVGEa7XFDEPtTQ9PY.jpg";

type View =
  | "home"
  | "animal-listings"
  | "about"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "user-dashboard";

type AboutUsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: "home" | "animal-listings" | "about";
  onNavigate: (view: View) => void;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Placeholder team members - replace with real SPCA Fiji team details.
const TEAM = [
  { name: "Surbhit S. Nand", role: "Admin", photo: "/images/surbhit.jpg", phone: "+679 7598409" },
  { name: "Kara A. Vergara", role: "Staff", photo: "/images/kara.jpg", phone: "+679 7695159" },
  { name: "Jasprit J. Singh", role: "Veterinarian", photo: "/images/jasprit.jpg", phone: "+679 9360148" },
  { name: "Dante Tafilagi", role: "Registered User", photo: "/images/dante.jpg", phone: "+679 9449458" },
  { name: "Alvin Kumar", role: "Unregistered User", photo: "/images/alvin.jpg", phone: "+679 9496759" },
];

const COMMITTEE = [
  ["President", "Seema Deo"],
  ["Vice President", "Seremaia Tuqiri"],
  ["Secretary", "Rehan Ali"],
  ["Treasurer", "Kee Fong, Shivani Mudaliar"],
  ["Members", "Amanda Millar, Grey Williamson, Archana Razak"],
];

export function AboutUs({ isLoaded, isSignedIn, currentPage, onNavigate }: AboutUsProps) {
  const [donateOpen, setDonateOpen] = useState(false);

  return (
    <div className="home-page about-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <section
          className="hero-section slideshow-hero about-image-hero"
          aria-label="About SPCA Fiji"
        >
          <div className="slideshow-window" aria-hidden="true">
            <div
              className="slideshow-slide active about-image-slide"
              style={{ backgroundImage: `url(${ABOUT_HERO_IMAGE})` }}
            />
          </div>
          <div className="slideshow-overlay about-image-overlay" aria-hidden="true" />
          <div className="slideshow-copy about-image-copy">
            <p className="eyebrow">Who we are</p>
            <h1>About SPCA Fiji</h1>
            <p className="lead-copy">
              Welcome to SPCA Fiji Islands! Here at SPCA Fiji, we know that
              sometimes all it takes to change the world is a little support.
              Since our founding in 1953, we have been determined to make an
              impact. The core of our efforts is to bring our team&apos;s fresh
              ideas and passion to the range of activities we&apos;re involved
              in. Through all of our endeavours, we hope to display the
              conviction behind our beliefs.
            </p>
            <div className="about-metrics">
              {[
                ["1953", "Serving Fiji since"],
                ["1000+", "Animals rehomed"],
                ["100%", "Donation funded"],
              ].map(([value, label]) => (
                <div className="stat-item" key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-help">
          <div>
            <p className="eyebrow">Want to help?</p>
            <h2>Fiji&apos;s animals are counting on us.</h2>
            <p>
              Fiji has a large stray dog (and cat) population in dire need of
              homes, food, and medical attention. We are the only shelter in
              the Suva area and operate on limited finances - please consider
              donating or reach out to us if you want to contribute in any
              other way.
            </p>
          </div>
          <div className="cta-actions">
            <button type="button" className="teal-button" onClick={() => setDonateOpen(true)}>
              Donate
            </button>
            <button type="button" className="teal-button" onClick={() => onNavigate("home")}>
              Meet the animals
            </button>
          </div>
        </section>

        <section className="about-mission">
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
        </section>

        <section className="about-team">
          <div className="about-section-head">
            <p className="eyebrow">Meet the team</p>
            <h2>The people behind the rescue.</h2>
          </div>
          <div className="about-team-grid">
            {TEAM.map((member) => (
              <div className="about-team-card" key={member.name}>
                {member.photo ? (
                  <img
                    className="about-team-photo"
                    src={member.photo}
                    alt={`${member.name} photo`}
                  />
                ) : (
                  <div className="about-avatar">{initials(member.name)}</div>
                )}
                <h3>{member.name}</h3>
                <p>{member.role}</p>
                <p className="about-team-phone">{member.phone}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="about-committee">
          <div className="about-section-head">
            <p className="eyebrow">Governance</p>
            <h2>SPCA Fiji Executive Committee 2025/2026</h2>
          </div>
          <p className="about-committee-intro">
            SPCA&apos;s governance and oversight is through an elected
            Executive Committee. Meetings are held once per month, and members
            of the committee are elected at each Annual General Meeting.
          </p>
          <div className="about-committee-list">
            {COMMITTEE.map(([role, names]) => (
              <div className="about-committee-row" key={role}>
                <span>{role}</span>
                <strong>{names}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="about-location">
          <div className="about-location-info">
            <p className="eyebrow">Get in touch</p>
            <h2>Visit us in Suva.</h2>
            <p className="about-location-address">155 Foster Road, Walu Bay, Suva City, Fiji</p>
            <ul>
              <li><strong>Hours:</strong> Monday - Saturday, 8am - 4.30pm</li>
              <li><strong>Email:</strong> spca@connect.com.fj</li>
              <li><strong>Phone:</strong> 3301266</li>
              <li><strong>Mobile:</strong> 9980023</li>
              <li><strong>After-hours emergencies:</strong> text 9922634</li>
            </ul>
          </div>
          <div className="about-map">
            <iframe
              title="SPCA Fiji location map"
              src="https://www.google.com/maps?q=155%20Foster%20Road%2C%20Walu%20Bay%2C%20Suva%2C%20Fiji&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
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
            <button type="button" className="ghost-button" onClick={() => setDonateOpen(true)}>
              Donate
            </button>
          </div>
        </section>
      </main>

      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
      <SiteFooter />
    </div>
  );
}