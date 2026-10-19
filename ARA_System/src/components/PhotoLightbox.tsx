import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type PhotoLightboxProps = {
  photos: string[];
  activeIndex: number;
  animalName: string;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
};

// Full-screen, uncropped view of an animal's photos. Shares the profile
// page's selected-photo index, so it opens on whichever photo is showing and
// flipping through here also moves the main gallery along with it.
// Rendered into document.body so no ancestor's overflow/stacking context can
// clip the fixed overlay.
export function PhotoLightbox({ photos, activeIndex, animalName, onPrevious, onNext, onClose }: PhotoLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hasMultiplePhotos = photos.length > 1;

  // Esc closes, left/right arrows flip photos - same window-level keydown
  // pattern as the app's other modals (DonateModal, MyReports).
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && hasMultiplePhotos) onPrevious();
      else if (event.key === "ArrowRight" && hasMultiplePhotos) onNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hasMultiplePhotos, onClose, onNext, onPrevious]);

  // Lock page scroll behind the overlay, move focus into the dialog, and
  // hand focus back to whatever opened it (the main photo) on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  // Keep Tab cycling between the dialog's own buttons (aria-modal).
  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button"));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Only a click on the dark backdrop itself closes - not the photo.
  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div
      ref={dialogRef}
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${animalName} photos`}
      onClick={closeOnBackdrop}
      onKeyDown={trapFocus}
    >
      <p className="photo-lightbox-counter" aria-live="polite">
        {activeIndex + 1} / {photos.length}
      </p>
      <button
        ref={closeButtonRef}
        type="button"
        className="photo-lightbox-close"
        aria-label="Close photo preview"
        onClick={onClose}
      >
        ✕
      </button>

      <img
        className="photo-lightbox-image"
        src={photos[activeIndex]}
        alt={`${animalName}, photo ${activeIndex + 1} of ${photos.length}`}
      />

      {hasMultiplePhotos && (
        <>
          <button
            type="button"
            className="profile-photo-nav prev photo-lightbox-nav"
            aria-label="Show previous photo"
            onClick={onPrevious}
          >
            ‹
          </button>
          <button
            type="button"
            className="profile-photo-nav next photo-lightbox-nav"
            aria-label="Show next photo"
            onClick={onNext}
          >
            ›
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
