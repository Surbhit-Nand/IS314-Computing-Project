import { useState } from "react";
import aboutAnimalsPhoto from "../assets/about-animals.webp";
import rescueJourneyImage from "../assets/Puppy+in+Suva-5855.webp";
import { DonateModal } from "../features/donations/DonateModal";
import { IconHeart, IconPaw, IconShieldCheck } from "./MedicalIcons";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type AboutUsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: "home" | "animal-listings" | "about";
  onNavigate: (view: SiteHeaderView) => void;
};

// Keep the existing project-team profiles and contact details unchanged.
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
    <div className="home-page about-page about-revamp">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main className="page-shell about2-main">
        <section className="about2-hero" aria-labelledby="about2-title">
          <img className="about2-hero-photo" src={aboutAnimalsPhoto} alt="A dog and cat together in a sunny outdoor setting" />
          <div className="about2-hero-shade" aria-hidden="true" />
          <div className="about2-container about2-hero-inner">
            <div className="about2-hero-copy">
              <p className="about2-overline about2-overline-light"><span className="about2-overline-dot" /> SPCA FIJI ISLANDS <span className="about2-dot-separator">·</span> EST. 1953</p>
              <h1 id="about2-title">Every animal deserves <span>a second chance.</span></h1>
              <p className="about2-hero-description">
                A little kindness can change an entire life. We are here for Fiji's animals —
                helping them find safety, care, and the loving homes they deserve.
              </p>
              <div className="about2-actions">
                <button className="about2-button about2-button-primary" type="button" onClick={() => onNavigate("animal-listings")}>Meet the animals <span aria-hidden="true">↗</span></button>
                <a
                  href="#about-our-story"
                  className="about2-button about2-button-outline"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById("about-our-story")?.scrollIntoView({
                      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                      block: "start",
                    });
                  }}
                >
                  Our story <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
          </div>
          <span className="about2-hero-bottom" aria-hidden="true" />
        </section>

        <section className="about2-impact about2-container" aria-label="SPCA Fiji at a glance">
          <div className="about2-impact-heading">A legacy of <strong>compassion.</strong></div>
          <div className="about2-impact-number"><strong>1953</strong><span>Serving Fiji since</span></div>
          <div className="about2-impact-number"><strong>1000+</strong><span>Animals rehomed</span></div>
          <div className="about2-impact-number"><strong>100%</strong><span>Donation funded</span></div>
        </section>

        <section id="about-our-story" className="about2-story about2-container" aria-labelledby="about2-story-title">
          <div className="about2-story-image-wrap">
            <img src={rescueJourneyImage} alt="Illustration of compassionate veterinary care for a rescued dog in Fiji" loading="lazy" />
            <div className="about2-story-caption"><IconHeart size={17} /> Care that makes a difference</div>
          </div>
          <div className="about2-story-text">
            <p className="about2-overline">OUR STORY</p>
            <h2 id="about2-story-title">Small acts of kindness. <em>Life-changing impact.</em></h2>
            <p>
              Since 1953, SPCA Fiji has been committed to making a difference for animals
              in need. Sometimes, changing the world starts with something simple: a safe
              place to sleep, a meal, or someone willing to care.
            </p>
            <p>
              From abandoned kittens to senior dogs, we work to prevent cruelty,
              encourage responsible pet ownership, and give animals a chance to
              find their forever families.
            </p>
            <div className="about2-care-list">
              <div><span><IconShieldCheck size={22} /></span><div><strong>Rescue & protection</strong><small>A safer future for vulnerable animals</small></div></div>
              <div><span><IconHeart size={22} /></span><div><strong>Compassionate care</strong><small>Veterinary care, patience, and recovery</small></div></div>
              <div><span><IconPaw size={22} /></span><div><strong>Second chances</strong><small>Helping animals find loving homes</small></div></div>
            </div>
          </div>
        </section>

        <section className="about2-help-band" aria-labelledby="about2-help-title">
          <div className="about2-container about2-help-inner">
            <div>
              <p className="about2-overline about2-overline-light">BE PART OF THEIR STORY</p>
              <h2 id="about2-help-title">Their next chapter could <em>start with you.</em></h2>
              <p>
                Fiji's stray dogs and cats need safe homes, food, and medical attention.
                As a shelter operating with limited finances, every little bit of support matters.
              </p>
            </div>
            <div className="about2-help-actions">
              <button type="button" className="about2-button about2-button-light" onClick={() => setDonateOpen(true)}>Make a donation <span aria-hidden="true">↗</span></button>
              <button type="button" className="about2-button about2-button-outline" onClick={() => onNavigate("animal-listings")}>Explore adoption <span aria-hidden="true">→</span></button>
            </div>
          </div>
        </section>

        <section className="about2-team-section" aria-labelledby="about2-team-title">
          <div className="about2-container">
            <div className="about2-section-heading">
              <div><p className="about2-overline">THE PEOPLE BEHIND THE WORK</p><h2 id="about2-team-title">Meet the team<span>.</span></h2></div>
            </div>
            <div className="about2-team-grid">
              {TEAM.map((member, index) => (
                <article className="about2-person" key={member.name} style={{ animationDelay: `${index * 60}ms` }}>
                  <div className="about2-person-photo-wrap"><img src={member.photo} alt={member.name} loading="lazy" /></div>
                  <div className="about2-person-info">
                    <h3>{member.name}</h3>
                    <p>{member.role}</p>
                    <a href={`tel:${member.phone.replace(/\s/g, "")}`} aria-label={`Call ${member.name}`}>{member.phone}</a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about2-governance" aria-labelledby="about2-governance-title">
          <div className="about2-container about2-governance-grid">
            <div className="about2-governance-intro">
              <p className="about2-overline about2-overline-light">GOVERNANCE</p>
              <h2 id="about2-governance-title">Guided by people who <em>believe in better.</em></h2>
              <p>SPCA Fiji Executive Committee 2025/2026</p>
              <p className="about2-governance-note">Oversight is provided by an elected Executive Committee that meets monthly. Committee members are elected at the Annual General Meeting.</p>
            </div>
            <div className="about2-governance-list">
              {COMMITTEE.map(([role, names], index) => (
                <div className="about2-governance-row" key={role}>
                  <span className="about2-governance-index">0{index + 1}</span>
                  <div><small>{role}</small><strong>{names}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about2-visit about2-container" aria-labelledby="about2-visit-title">
          <div className="about2-visit-intro">
            <p className="about2-overline">COME SAY HELLO</p>
            <h2 id="about2-visit-title">Find us in <em>Suva.</em></h2>
            <p>We'd love to hear from you. Reach out about helping Fiji's animals or stop by during opening hours.</p>
            <address>155 Foster Road, Walu Bay, Suva City, Fiji</address>
            <dl className="about2-contact-grid">
              <div><dt>Opening hours</dt><dd>Monday – Saturday, 8am – 4:30pm</dd></div>
              <div><dt>Email</dt><dd><a href="mailto:spca@connect.com.fj">spca@connect.com.fj</a></dd></div>
              <div><dt>Phone</dt><dd><a href="tel:3301266">3301266</a> · <a href="tel:9980023">9980023</a></dd></div>
              <div><dt>After-hours emergencies</dt><dd>Text <a href="sms:9922634">9922634</a></dd></div>
            </dl>
            <a className="about2-directions" href="https://www.google.com/maps/search/?api=1&query=155%20Foster%20Road%20Walu%20Bay%20Suva%20Fiji" target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a>
          </div>
          <div className="about2-map-frame">
            <iframe title="SPCA Fiji location map" src="https://www.google.com/maps?q=155%20Foster%20Road%2C%20Walu%20Bay%2C%20Suva%2C%20Fiji&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </section>

        <section className="about2-outro">
          <div className="about2-container about2-outro-inner">
            <p className="about2-overline about2-overline-light">A BETTER TOMORROW</p>
            <h2>Help us make more <em>happy endings.</em></h2>
            <p>Adopt, volunteer, or donate. Every action is a step toward a kinder Fiji for animals.</p>
            <div className="about2-actions">
              <button type="button" className="about2-button about2-button-light" onClick={() => onNavigate("animal-listings")}>Meet the animals <span aria-hidden="true">↗</span></button>
              <button type="button" className="about2-button about2-button-outline" onClick={() => setDonateOpen(true)}>Donate <span aria-hidden="true">→</span></button>
            </div>
          </div>
        </section>
      </main>

      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
      <SiteFooter />
    </div>
  );
}
