import { useEffect, useRef } from "react";
import * as L from "leaflet";
import { addOsmTileLayer, RESCUE_MARKER_ICON } from "../../utils/leaflet";

type RescueReadOnlyMapProps = {
  latitude: number;
  longitude: number;
};

// Read-only Leaflet/OpenStreetMap for the expanded rescue case details. Shows
// the saved pin exactly where the reporter dropped it - no panning/editing
// controls beyond what OpenStreetMap tiles offer by default (scroll zoom is
// disabled so scrolling the page doesn't trap the case row).
export function RescueReadOnlyMap({ latitude, longitude }: RescueReadOnlyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, { center: [latitude, longitude], zoom: 14 });
    addOsmTileLayer(map);
    L.marker([latitude, longitude], { icon: RESCUE_MARKER_ICON }).addTo(map);
    map.scrollWheelZoom.disable();
    return () => {
      map.remove();
    };
  }, [latitude, longitude]);

  return (
    <div className="rescue-readonly-map">
      <div className="rescue-map" ref={containerRef} aria-label="Rescue location map" />
    </div>
  );
}