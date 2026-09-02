import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import { addOsmTileLayer, FIJI_CENTER, RESCUE_MARKER_ICON } from "../../utils/leaflet";

type RescueLocationMapProps = {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (latitude: number, longitude: number) => void;
};

function geolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Allow your browser's location permission and try again, or click the map to drop a pin.";
    case error.POSITION_UNAVAILABLE:
      return "Your current position could not be determined. Click the map to drop a pin instead.";
    case error.TIMEOUT:
      return "Finding your location timed out. Try again or click the map to drop a pin.";
    default:
      return "Your location could not be determined. Click the map to drop a pin instead.";
  }
}

// Interactive location picker for the rescue report form, powered by Leaflet +
// OpenStreetMap (free, no API key). The map is centred on Suva, Fiji by
// default. The user clicks anywhere to place (or move) a single marker, drags
// the marker to fine-tune it, or uses "Use My Location" to pin their
// browser-geolocated position. Every change is handed to the form via
// onLocationChange so the coordinates are saved with the report.
export function RescueLocationMap({
  latitude,
  longitude,
  onLocationChange,
}: RescueLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  // Keeps the always-latest callback available inside the once-only map setup
  // and the marker drag handler without recreating them on every render.
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  // Places or moves the single marker and pans the map over to it. Uses refs
  // only, so it is safe to call from the map listener, the drag handler, the
  // geolocation handler, and the prop-sync effect.
  const placeMarker = useCallback((pinLatitude: number, pinLongitude: number) => {
    const map = mapRef.current;
    if (!map) return;
    const position: L.LatLngExpression = [pinLatitude, pinLongitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      markerRef.current = L.marker(position, {
        draggable: true,
        icon: RESCUE_MARKER_ICON,
      }).addTo(map);
      markerRef.current.on("dragend", () => {
        const markerPosition = markerRef.current?.getLatLng();
        if (markerPosition) {
          onLocationChangeRef.current(markerPosition.lat, markerPosition.lng);
        }
      });
    }
    map.panTo(position);
  }, []);

  // Creates the map exactly once, centred on Fiji. Clicking anywhere places
  // or moves the marker and reports the coordinates.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, { center: FIJI_CENTER, zoom: 12 });
    mapRef.current = map;
    addOsmTileLayer(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      placeMarker(lat, lng);
      onLocationChangeRef.current(lat, lng);
    });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [placeMarker]);

  // Keeps the map in sync with the form state (e.g. after "Use My Location"
  // or a programmatic pin): move the marker to the latest coordinates.
  useEffect(() => {
    if (latitude == null || longitude == null) return;
    placeMarker(latitude, longitude);
  }, [latitude, longitude, placeMarker]);

  // Drops a marker at the browser's current position (with the user's
  // permission) and hands the coordinates back to the form.
  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError(
        "Geolocation is not supported by this browser. Click the map to drop a pin instead.",
      );
      return;
    }
    setLocationError("");
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude: pinLatitude, longitude: pinLongitude } = position.coords;
        mapRef.current?.setView([pinLatitude, pinLongitude], 14);
        placeMarker(pinLatitude, pinLongitude);
        onLocationChangeRef.current(pinLatitude, pinLongitude);
      },
      (error) => {
        setIsLocating(false);
        setLocationError(geolocationErrorMessage(error));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  return (
    <div className="rescue-map-card">
      <div className="rescue-map-toolbar">
        <span className="rescue-map-hint">
          Click the map to drop a pin, or drag the marker to fine-tune it
        </span>
        <button
          type="button"
          className="teal-button small-button"
          onClick={handleUseMyLocation}
          disabled={isLocating}
        >
          {isLocating ? "Finding your location..." : "Use My Location"}
        </button>
      </div>
      {locationError && <p className="invite-feedback error">{locationError}</p>}
      <div
        className="rescue-map"
        ref={containerRef}
        aria-label="Map - click to pin the animal's location"
      />
      {latitude != null && longitude != null && (
        <p className="rescue-map-coordinates">
          Selected location: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      )}
    </div>
  );
}