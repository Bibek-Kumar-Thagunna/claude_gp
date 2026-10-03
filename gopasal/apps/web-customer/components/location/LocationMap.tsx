"use client";

import * as React from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { mapConfig, type CustomerPoint, type MapSurface } from "@/lib/api/customer";
import { loadGoogleMaps } from "@/lib/google-maps";

export function LocationMap({
  point,
  onChange,
}: {
  point: CustomerPoint;
  onChange: (point: CustomerPoint) => void;
}) {
  const [config, setConfig] = React.useState<MapSurface | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void mapConfig().then((value) => {
      if (active) setConfig(value.surfaces?.pin ?? value);
    }).catch(() => active && setError("The map is unavailable. You can still use your GPS pin."));
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>;
  if (!config) return <div className="h-[280px] animate-pulse rounded-2xl bg-ink-100 sm:h-[340px]" />;
  if (config.provider === "google") {
    return config.token
      ? <GooglePinMap point={point} onChange={onChange} token={config.token} />
      : <p role="alert">Google Maps browser key is missing.</p>;
  }
  return <MapLibrePinMap point={point} onChange={onChange} config={config} />;
}

function GooglePinMap({ point, onChange, token }: {
  point: CustomerPoint;
  onChange: (point: CustomerPoint) => void;
  token: string;
}) {
  const node = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<google.maps.Map | null>(null);
  const marker = React.useRef<google.maps.Marker | null>(null);
  const onChangeRef = React.useRef(onChange);
  const initialPoint = React.useRef(point);
  const [error, setError] = React.useState<string | null>(null);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    let active = true;
    void loadGoogleMaps(token).then(async () => {
      await google.maps.importLibrary("maps");
      if (!active || !node.current) return;
      const instance = new google.maps.Map(node.current, {
        center: initialPoint.current,
        zoom: 17,
        mapTypeControl: false,
        streetViewControl: false,
      });
      const pin = new google.maps.Marker({ position: initialPoint.current, map: instance, draggable: true });
      instance.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        pin.setPosition(event.latLng);
        onChangeRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      pin.addListener("dragend", (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        onChangeRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      map.current = instance;
      marker.current = pin;
    }).catch(() => active && setError("Google map could not load. You can still use GPS coordinates."));
    return () => {
      active = false;
      if (marker.current) marker.current.setMap(null);
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
      map.current = null;
      marker.current = null;
    };
  }, [token]);
  React.useEffect(() => {
    const position = { lat: point.lat, lng: point.lng };
    marker.current?.setPosition(position);
    map.current?.panTo(position);
  }, [point.lat, point.lng]);
  return <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-ink-50">
    <div ref={node} className="h-[280px] w-full sm:h-[340px]" aria-label="Choose delivery pin on Google map" />
    {error && <p role="alert" className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 p-3 text-xs text-ink-600 shadow-soft">{error}</p>}
  </div>;
}

function MapLibrePinMap({ point, onChange, config }: {
  point: CustomerPoint;
  onChange: (point: CustomerPoint) => void;
  config: MapSurface;
}) {
  const node = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const marker = React.useRef<Marker | null>(null);
  const onChangeRef = React.useRef(onChange);
  const initialPoint = React.useRef(point);
  const [error, setError] = React.useState<string | null>(null);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (!node.current || map.current) return;
    let active = true;
    try {
        if (!active || !node.current) return;
        if (!config.styleUrl) {
          setError("The production map style is not configured. Your GPS pin can still be used.");
          return;
        }
        const instance = new maplibregl.Map({
          container: node.current,
          style: config.styleUrl,
          center: [initialPoint.current.lng, initialPoint.current.lat],
          zoom: 15,
        });
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        const pin = new maplibregl.Marker({ color: "#E11945", draggable: true })
          .setLngLat([initialPoint.current.lng, initialPoint.current.lat])
          .addTo(instance);
        pin.on("dragend", () => {
          const next = pin.getLngLat();
          onChangeRef.current({ lat: next.lat, lng: next.lng });
        });
        instance.on("click", (event) => {
          pin.setLngLat(event.lngLat);
          onChangeRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
        });
        map.current = instance;
        marker.current = pin;
    } catch {
      setError("The map could not load. Your GPS pin can still be used.");
    }
    return () => {
      active = false;
      marker.current?.remove();
      map.current?.remove();
      marker.current = null;
      map.current = null;
    };
  }, [config.styleUrl]);

  React.useEffect(() => {
    marker.current?.setLngLat([point.lng, point.lat]);
    map.current?.easeTo({ center: [point.lng, point.lat], duration: 300 });
  }, [point.lat, point.lng]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-ink-50">
      <div
        ref={node}
        className="h-[280px] w-full sm:h-[340px]"
        aria-label="Choose delivery pin on map"
      />
      {error && (
        <p className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 p-3 text-xs text-ink-600 shadow-soft">
          {error}
        </p>
      )}
      {config.provider === "baato" && (
        <p className="absolute bottom-1 left-2 z-10 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-ink-600 backdrop-blur">
          <a href="https://baato.io" target="_blank" rel="noreferrer" className="font-semibold">
            Baato
          </a>{" "}
          ·{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </p>
      )}
    </div>
  );
}
