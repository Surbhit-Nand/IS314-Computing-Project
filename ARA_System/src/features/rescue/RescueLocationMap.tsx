import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "../../services/googleMaps";

type RescueLocationMapProps = {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (latitude: number, longitude: number) => void;
};

// Default view shown while no pin is placed: Suva, Fiji (SPCA Fiji's base).
const SUVA_CENTER: google.maps.LatLngLiteral = { lat: -18.1248, lng: 178.4501 };

function geolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location access was denied. Allow your browser's location permission and try again, or pin the location on the map.";
    case error.POSITION_UNAVAILABLE:
      return "Your current position could not be determined. Pin the location on the map instead.";
    case error.TIMEOUT:
      return "Finding your location timed out. Try again or pin the location on the map.";
    default:
      return "Your location could not be determined. Pin the location on the map instead.";
  }
}

// Interactive location picker for the rescue report form. The map loads
// centred on Suva (or the current pin), the user clicks anywhere to place or
// move a marker, and the "Use My Location" button drops a marker at their
// browser-geolocated position. Both update the parent form state via
// onLocationChange so the coordinates are saved with the report.
export function RescueLocationMap({
  latitude,
  longitude,
  onLocationChange,
}: RescueLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const googleMapsRef = useRef<typeof google.maps | null>(null);
  // Coordinates the page first rendered with - the map is created once, so we
  // only read these at mount rather than on every prop change.
  const initialCoordinates = useRef<google.maps.LatLngLiteral | null>(
    latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
  );

  const [mapError, setMapError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  // Keeps the always-latest callback available inside the once-only map
  // setup effect without recreating the map on every render.
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  // Places or moves the single marker and pulls the map over to it. Uses refs
  // only, so it is safe to call from the map listener and the button.
  function placeMarker(pinLatitude: number, pinLongitude: number) {
    const maps = googleMapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    const position: google.maps.LatLngLiteral = { lat: pinLatitude, lng: pinLongitude };
    if (!markerRef.current) {
      markerRef.current = new maps.Marker({ map, position });
    } else {
      markerRef.current.setPosition(position);
    }
    map.panTo(position);
  }

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        googleMapsRef.current = maps;
        mapRef.current = new maps.Map(containerRef.current, {
          center: initialCoordinates.current ?? SUVA_CENTER,
          zoom: 14,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        mapRef.current.addListener("click", (event: google.maps.MapMouseEvent) => {
          const pinLatitude = event.latLng?.lat();
          const pinLongitude = event.latLng?.lng();
          if (pinLatitude == null || pinLongitude == null) return;
          placeMarker(pinLatitude, pinLongitude);
          onLocationChangeRef.current(pinLatitude, pinLongitude);
        });
        if (initialCoordinates.current) {
          placeMarker(initialCoordinates.current.lat, initialCoordinates.current.lng);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(
            error instanceof Error ? error.message : "Google Maps failed to load.",
          );
        }
      });
    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  // Drops a marker at the browser's current position (with the user's
  // permission) and hands the coordinates back to the form.
  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError(
        "Geolocation is not supported by this browser. Pin the location on the map instead.",
      );
      return;
    }
    setLocationError("");
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude: pinLatitude, longitude: pinLongitude } = position.coords;
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
        <span className="rescue-map-hint">Click the map to drop a pin</span>
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
      {mapError ? (
        <div className="rescue-map-unavailable" role="status">
          <p>Something went wrong loading the map.</p>
          <p>You can still submit your report using the location description above.</p>
        </div>
      ) : (
        <div
          className="rescue-map"
          ref={containerRef}
          aria-label="Map - click to pin the animal's location"
        />
      )}
      {latitude != null && longitude != null && (
        <p className="rescue-map-coordinates">
          Pinned location: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      )}
    </div>
  );
}