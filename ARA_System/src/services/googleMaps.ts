// Loads the Google Maps JavaScript API exactly once and resolves when it is
// ready. Shared by every map component so the script tag is never injected
// twice (React StrictMode double-invokes effects in dev, and there can be
// more than one map on a page). Fails fast with a readable message when the
// API key is missing, which the calling component surfaces to the user.

type GoogleMapsNamespace = typeof google.maps;

declare global {
  interface Window {
    google?: { maps?: GoogleMapsNamespace };
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const READY_CALLBACK = "__araGoogleMapsReady";

let loadPromise: Promise<GoogleMapsNamespace> | null = null;

function resolveApiKeyError(): string {
  return API_KEY
    ? "Google Maps failed to load."
    : "Google Maps is not configured. Set VITE_GOOGLE_MAPS_API_KEY in your .env.local file.";
}

export function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  if (loadPromise) return loadPromise;
  if (!API_KEY) {
    loadPromise = Promise.reject(new Error(resolveApiKeyError()));
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-google-maps]",
    );

    if (existing) {
      const waitForReady = () => {
        if (window.google?.maps) {
          resolve(window.google.maps);
        } else {
          // The existing script is still loading (or failed) - poll until it
          // is available or give up.
          window.setTimeout(waitForReady, 50);
        }
      };
      waitForReady();
      return;
    }

    const windowRef = window as unknown as Window & Record<string, unknown>;
    windowRef[READY_CALLBACK] = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      }
    };

    const script = document.createElement("script");
    script.dataset.googleMaps = "";
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}` +
      `&callback=${READY_CALLBACK}&loading=async&v=weekly`;
    script.onerror = () => reject(new Error(resolveApiKeyError()));
    document.head.appendChild(script);
  });

  return loadPromise;
}