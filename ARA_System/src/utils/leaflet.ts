import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Leaflet's default marker images are referenced by an internal relative URL
// that bundled deployments routinely fail to resolve - the classic "map
// loads, but the pin is invisible" bug. Vite's `?inline` query forces these
// PNGs into the JS bundle as base64 data URIs, so the icon/shadow can never
// 404 (works in dev and production, from any mount path/CDN). This util file
// also exports an explicit icon that every marker passes in, so rendering
// never depends on Leaflet's Icon.Default image resolution.
import markerIcon from "leaflet/dist/images/marker-icon.png?inline";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png?inline";
import markerShadow from "leaflet/dist/images/marker-shadow.png?inline";

// Explicit marker icon passed to every L.marker() call. Sizes match
// Leaflet's standard defaults (25x41 CSS pixels; the 2x asset is the same
// physical size at higher resolution, used automatically on retina displays).
export const RESCUE_MARKER_ICON = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Belt-and-suspenders: also point Icon.Default at the same embedded images so
// that any marker created without an explicit icon inherits a working one.
// Idempotent - safe even though every map component imports this module.
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Default view for both maps before a pin is placed / available: Suva, Fiji
// (SPCA Fiji's base).
export const FIJI_CENTER: [number, number] = [-18.1248, 178.4501];

// Adds the OpenStreetMap tile layer with the required attribution. Free to
// use - no API key - as long as attribution stays visible.
export function addOsmTileLayer(map: L.Map): void {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
}