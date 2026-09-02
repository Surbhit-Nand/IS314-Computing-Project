import { useEffect } from "react";

type SuccessToastProps = {
  message: string;
  onDismiss: () => void;
  // Auto-dismiss after this long unless the viewer closes it first.
  durationMs?: number;
};

// A small corner notification for confirming an action succeeded, without
// blocking the page (unlike window.alert, which this sits alongside rather
// than replaces - error handling elsewhere is untouched by this component).
// Auto-dismisses on a timer, or immediately via the close button.
export function SuccessToast({ message, onDismiss, durationMs = 5000 }: SuccessToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div className="toast toast-success" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss notification">
        &times;
      </button>
    </div>
  );
}
