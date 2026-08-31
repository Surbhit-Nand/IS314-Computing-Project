import spcaLogo from "../assets/spca-logo.png";

export function SiteFooter() {
  return (
    <footer className="spca-footer" id="donate">
      <div className="spca-footer-inner">
        <div className="spca-footer-col spca-footer-brand-col">
          <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo footer-logo" />
          <p className="spca-footer-follow">Follow us!</p>
          <div className="spca-social">
            <a
              href="https://www.instagram.com/fijispca"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.9.07s-3.62-.01-4.9-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.63 2.2 15.25 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.37 2.21 8.75 2.2 12 2.2Zm0 1.8c-3.15 0-3.52.01-4.76.07-1.08.05-1.66.23-2.05.38-.51.2-.88.44-1.26.83-.39.38-.62.74-.82 1.25-.15.4-.33.98-.38 2.06C2.68 9.96 2.67 10.33 2.67 12s.01 2.04.07 3.27c.05 1.08.23 1.66.38 2.05.2.51.44.88.82 1.26.38.39.74.62 1.26.82.4.15.97.33 2.05.38 1.24.06 1.61.07 4.76.07s3.52-.01 4.76-.07c1.08-.05 1.66-.23 2.05-.38.51-.2.88-.44 1.26-.82.39-.38.62-.74.82-1.26.15-.4.33-.97.38-2.05.06-1.24.07-1.61.07-3.27s-.01-2.04-.07-3.27c-.05-1.08-.23-1.66-.38-2.05-.2-.51-.44-.88-.82-1.26a3.42 3.42 0 0 0-1.26-.82c-.4-.15-.97-.33-2.05-.38-1.24-.06-1.61-.07-4.76-.07Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 1.8a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Zm5.1-3.25a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/fijispca"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.7c0-.93.26-1.56 1.59-1.56h1.7V4.27c-.3-.04-1.3-.13-2.47-.13-2.44 0-4.11 1.49-4.11 4.23v2.42H7.5V14h2.7v8h3.3Z" />
              </svg>
            </a>
            <a href="mailto:spca@connect.com.fj" aria-label="spca@connect.com.fj">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="spca-footer-col">
          <h4>Opening Times</h4>
          <p>Monday - Saturday: 8 am - 4.30 pm &amp; extra appointments</p>
        </div>

        <div className="spca-footer-col">
          <h4>Location</h4>
          <p>155 Foster Road, Walu Bay Suva City Fiji</p>
        </div>

        <div className="spca-footer-col">
          <h4>Contact</h4>
          <p>
            <strong>Phone:</strong> 8926200 (working hours)
          </p>
          <p className="spca-footer-small">
            <strong>After hours (emergency only, between 5pm and 10pm):</strong>{" "}
            TEXT 9922634
          </p>
          <p className="spca-footer-small">
            <strong>For appointments:</strong>{" "}
            <a href="mailto:spcafijireception@gmail.com">spcafijireception@gmail.com</a>
          </p>
          <p className="spca-footer-small">
            <strong>For any other questions:</strong>{" "}
            <a href="mailto:spca@connect.com.fj">spca@connect.com.fj</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
