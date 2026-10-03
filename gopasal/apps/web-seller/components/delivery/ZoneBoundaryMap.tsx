"use client";

import * as React from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import { rawRequest } from "@gopasal/api-client";
import type { LatLngWire } from "@/lib/api/delivery";

const DEFAULT_CENTER: LatLngWire = { lat: 27.7172, lng: 85.324 };
const ZONE_SOURCE = "seller-zone-boundary";
const RADIUS_SOURCE = "seller-radius-boundary";

type MapConfig = { styleUrl?: string };

function closedRing(points: LatLngWire[]): [number, number][] {
  if (points.length < 3) return [];
  const ring = points.map((point) => [point.lng, point.lat] as [number, number]);
  ring.push(ring[0]!);
  return ring;
}

function circleRing(center: LatLngWire, radiusKm: number): [number, number][] {
  const radius = Math.max(0.1, radiusKm);
  const latRadians = (center.lat * Math.PI) / 180;
  const latDegrees = radius / 110.574;
  const lngDegrees = radius / (111.32 * Math.max(0.2, Math.cos(latRadians)));
  return Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return [center.lng + Math.cos(angle) * lngDegrees, center.lat + Math.sin(angle) * latDegrees];
  });
}

function featureCollection(
  coordinates: [number, number][],
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: coordinates.length
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [coordinates] },
          },
        ]
      : [],
  };
}

export function ZoneBoundaryMap({
  points,
  shopLocation,
  deliveryRadiusKm,
  onChange,
}: {
  points: LatLngWire[];
  shopLocation: LatLngWire | null;
  deliveryRadiusKm: number;
  onChange: (points: LatLngWire[]) => void;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const vertexMarkers = React.useRef<Marker[]>([]);
  const shopMarker = React.useRef<Marker | null>(null);
  const pointsRef = React.useRef(points);
  const onChangeRef = React.useRef(onChange);
  const shopLocationRef = React.useRef(shopLocation);
  const deliveryRadiusKmRef = React.useRef(deliveryRadiusKm);
  const [error, setError] = React.useState<string | null>(null);
  pointsRef.current = points;
  onChangeRef.current = onChange;
  shopLocationRef.current = shopLocation;
  deliveryRadiusKmRef.current = deliveryRadiusKm;

  React.useEffect(() => {
    if (!container.current || map.current) return;
    let active = true;
    void rawRequest<MapConfig>("/discovery/map-config")
      .then((config) => {
        if (!active || !container.current || !config.styleUrl) {
          if (active)
            setError("The map style is unavailable. You can still paste coordinates below.");
          return;
        }
        const initialShopLocation = shopLocationRef.current;
        const center = initialShopLocation ?? pointsRef.current[0] ?? DEFAULT_CENTER;
        const instance = new maplibregl.Map({
          container: container.current,
          style: config.styleUrl,
          center: [center.lng, center.lat],
          zoom: 13,
        });
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        instance.on("load", () => {
          instance.addSource(RADIUS_SOURCE, {
            type: "geojson",
            data: featureCollection(
              initialShopLocation
                ? circleRing(initialShopLocation, deliveryRadiusKmRef.current)
                : [],
            ),
          });
          instance.addLayer({
            id: "seller-radius-fill",
            type: "fill",
            source: RADIUS_SOURCE,
            paint: { "fill-color": "#2563eb", "fill-opacity": 0.07 },
          });
          instance.addLayer({
            id: "seller-radius-line",
            type: "line",
            source: RADIUS_SOURCE,
            paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 2] },
          });
          instance.addSource(ZONE_SOURCE, {
            type: "geojson",
            data: featureCollection(closedRing(pointsRef.current)),
          });
          instance.addLayer({
            id: "seller-zone-fill",
            type: "fill",
            source: ZONE_SOURCE,
            paint: { "fill-color": "#e11945", "fill-opacity": 0.16 },
          });
          instance.addLayer({
            id: "seller-zone-line",
            type: "line",
            source: ZONE_SOURCE,
            paint: { "line-color": "#e11945", "line-width": 3 },
          });
        });
        instance.on("click", (event) => {
          if (pointsRef.current.length >= 50) return;
          onChangeRef.current([
            ...pointsRef.current,
            { lat: event.lngLat.lat, lng: event.lngLat.lng },
          ]);
        });
        map.current = instance;
      })
      .catch(() => setError("The map could not load. You can still paste coordinates below."));
    return () => {
      active = false;
      vertexMarkers.current.forEach((marker) => marker.remove());
      vertexMarkers.current = [];
      shopMarker.current?.remove();
      shopMarker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  React.useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const source = instance.getSource(ZONE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(featureCollection(closedRing(points)));

    vertexMarkers.current.forEach((marker) => marker.remove());
    vertexMarkers.current = points.map((point, index) => {
      const marker = new maplibregl.Marker({ color: "#E11945", draggable: true, scale: 0.72 })
        .setLngLat([point.lng, point.lat])
        .addTo(instance);
      marker.getElement().title = `Boundary point ${index + 1} — drag to adjust`;
      marker.getElement().addEventListener("click", (event) => event.stopPropagation());
      marker.on("dragend", () => {
        const moved = marker.getLngLat();
        onChangeRef.current(
          pointsRef.current.map((current, currentIndex) =>
            currentIndex === index ? { lat: moved.lat, lng: moved.lng } : current,
          ),
        );
      });
      return marker;
    });
  }, [points]);

  React.useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const source = instance.getSource(RADIUS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(
      featureCollection(shopLocation ? circleRing(shopLocation, deliveryRadiusKm) : []),
    );
    shopMarker.current?.remove();
    shopMarker.current = shopLocation
      ? new maplibregl.Marker({ color: "#2563EB", scale: 0.88 })
          .setLngLat([shopLocation.lng, shopLocation.lat])
          .setPopup(new maplibregl.Popup({ offset: 24 }).setText("Verified shop location"))
          .addTo(instance)
      : null;
  }, [deliveryRadiusKm, shopLocation]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
      <div
        ref={container}
        className="h-[300px] w-full"
        aria-label="Draw the delivery zone boundary on the map"
      />
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 text-[11px] font-semibold">
        <span className="rounded-full bg-white/95 px-2.5 py-1 text-crimson-700 shadow-sm">
          Red: custom zone
        </span>
        {shopLocation && (
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-blue-700 shadow-sm">
            Blue: {deliveryRadiusKm} km standard radius
          </span>
        )}
      </div>
      {error && (
        <p className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 p-3 text-xs text-ink-600 shadow-soft">
          {error}
        </p>
      )}
    </div>
  );
}
