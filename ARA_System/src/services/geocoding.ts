// Place-name lookup powered by OSM's free Nominatim geocoder - no API key
// needed, subject to OSM attribution (already shown on the map) and a soft ~1
// request/second limit, so reverse lookups are throttled by the caller.
// Kept behind this module so the provider could be swapped later without
// touching components.

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export type PlaceLookup = {
  latitude: number;
  longitude: number;
  displayName: string;
};

const SEARCH_TIMEOUT_MS = 8_000;

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Geocoder returned ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

// Forward geocode: turn a free-text location name into candidate coordinates.
// Country is restricted to Fiji so a bare search like "Suva" or "Nadi" maps to
// the right place for a Fiji rescue report instead of a namesake elsewhere.
export async function searchPlaces(query: string): Promise<PlaceLookup[]> {
  const url =
    `${NOMINATIM_BASE}/search?format=jsonv2&limit=6&addressdetails=0` +
    `&countrycodes=FJ&q=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return [];
  return data
    .map((hit: { lat?: string; lon?: string; display_name?: string }) => {
      const latitude = hit.lat == null ? null : Number(hit.lat);
      const longitude = hit.lon == null ? null : Number(hit.lon);
      if (latitude == null || longitude == null || !hit.display_name) return null;
      return { latitude, longitude, displayName: hit.display_name };
    })
    .filter((hit): hit is PlaceLookup => hit !== null);
}

// Reverse geocode: turn coordinates into an address/place name. Returns null
// when the geocoder has nothing to say about that spot.
export async function reverseGeocodePlace(
  latitude: number,
  longitude: number,
): Promise<PlaceLookup | null> {
  const url =
    `${NOMINATIM_BASE}/reverse?format=jsonv2&zoom=16&addressdetails=0` +
    `&lat=${latitude}&lon=${longitude}`;
  const data = await fetchJson(url);
  if (!data || typeof data !== "object" || !data.display_name) return null;
  const label = data.display_name as string;
  return { latitude, longitude, displayName: label };
}