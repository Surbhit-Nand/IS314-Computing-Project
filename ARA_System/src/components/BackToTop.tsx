import { useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import "./BackToTop.css";

export function BackToTop() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [scroll, setScroll] = useState({ visible: false, progress: 0 });
  const role = user?.publicMetadata.role;
  const enabled = isLoaded && (!isSignedIn || !role || role === "user");

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      setScroll({
        visible: window.scrollY > Math.max(480, window.innerHeight * 0.75),
        progress: distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0,
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled]);

  if (!enabled || !scroll.visible) return null;

  return (
    <button
      type="button"
      className="back-to-top"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      })}
    >
      <span className="back-to-top-icon" aria-hidden="true">
        <svg className="back-to-top-ring" viewBox="0 0 44 44">
          <circle className="back-to-top-track" cx="22" cy="22" r="19" />
          <circle cx="22" cy="22" r="19" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - scroll.progress} />
        </svg>
        <svg className="back-to-top-arrow" viewBox="0 0 24 24" fill="none">
          <path d="m6 12 6-6 6 6M12 6v13" />
        </svg>
      </span>
      <span className="back-to-top-label">Back to top</span>
    </button>
  );
}
