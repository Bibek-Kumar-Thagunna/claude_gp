"use client";

import * as React from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import {
  mapConfig,
  resolvePlace,
  suggestPlaces,
  type CustomerPoint,
  type PlaceSuggestion,
  type ResolvedPlace,
} from "@/lib/api/customer";
import { loadGoogleMaps } from "@/lib/google-maps";

export function PlaceSearch({
  near,
  onSelect,
}: {
  near?: CustomerPoint | null;
  onSelect: (place: ResolvedPlace) => void;
}) {
  const [pin, setPin] = React.useState<{ provider: string; token: string | null } | null>(null);
  React.useEffect(() => {
    let active = true;
    void mapConfig().then((config) => {
      if (active) setPin(config.surfaces?.pin ?? config);
    }).catch(() => {
      if (active) setPin({ provider: "unavailable", token: null });
    });
    return () => { active = false; };
  }, []);
  if (!pin) return <p className="text-xs text-ink-500">Loading location search…</p>;
  if (pin.provider === "google" && pin.token) {
    return <GooglePlaceSearch token={pin.token} onSelect={onSelect} />;
  }
  return <BaatoPlaceSearch near={near} onSelect={onSelect} />;
}

function GooglePlaceSearch({
  token,
  onSelect,
}: {
  token: string;
  onSelect: (place: ResolvedPlace) => void;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const onSelectRef = React.useRef(onSelect);
  const [error, setError] = React.useState<string | null>(null);
  onSelectRef.current = onSelect;
  React.useEffect(() => {
    let active = true;
    let element: google.maps.places.PlaceAutocompleteElement | null = null;
    let selected: ((event: google.maps.places.PlacePredictionSelectEvent) => void) | null = null;
    void loadGoogleMaps(token).then(async () => {
      await google.maps.importLibrary("places");
      if (!active || !container.current) return;
      element = new google.maps.places.PlaceAutocompleteElement({ includedRegionCodes: ["np"] });
      element.style.width = "100%";
      selected = (event) => {
        const place = event.placePrediction.toPlace();
        void place.fetchFields({ fields: ["location"] })
          .then(() => {
            if (!active || !place.location) return;
            onSelectRef.current({
              id: place.id,
              // Google search content stays inside its widget/map. The saved
              // delivery label is typed by the customer, not copied from Places.
              name: "Selected pin",
              address: "",
              type: "GOOGLE",
              lat: place.location.lat(),
              lng: place.location.lng(),
            });
            setError(null);
          })
          .catch(() => setError("That place could not be opened. Try another landmark or use GPS."));
      };
      element.addEventListener("gmp-select", selected as EventListener);
      container.current.appendChild(element);
    }).catch(() => active && setError("Google search is unavailable. Use GPS or place the pin manually."));
    return () => {
      active = false;
      if (element && selected) element.removeEventListener("gmp-select", selected as EventListener);
      element?.remove();
    };
  }, [token]);
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-ink-900">Search a place or landmark</label>
      <div ref={container} className="min-h-12" />
      <p className="mt-1 text-xs text-ink-500">Google results appear on the Google pin map below. Confirm the exact entrance yourself.</p>
      {error && <p role="alert" className="mt-2 text-xs text-amber-700">{error}</p>}
    </div>
  );
}

function BaatoPlaceSearch({
  near,
  onSelect,
}: {
  near?: CustomerPoint | null;
  onSelect: (place: ResolvedPlace) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [rows, setRows] = React.useState<PlaceSuggestion[]>([]);
  const [attribution, setAttribution] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const listboxId = React.useId();
  const nearLat = near?.lat;
  const nearLng = near?.lng;
  const selectedQuery = React.useRef<string | null>(null);

  React.useEffect(() => {
    const clean = query.trim();
    if (clean.length < 3 || clean === selectedQuery.current) {
      setRows([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      const bias =
        nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : null;
      void suggestPlaces(clean, bias, controller.signal)
        .then((result) => {
          setRows(result.suggestions);
          setAttribution(result.attribution);
          setError(
            result.provider === "osm"
              ? "Place search will be available when the production map provider is connected."
              : null,
          );
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setRows([]);
          setError(cause instanceof Error ? cause.message : "Location search is unavailable.");
        })
        .finally(() => !controller.signal.aborted && setBusy(false));
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [nearLat, nearLng, query]);

  async function choose(row: PlaceSuggestion) {
    setBusy(true);
    setError(null);
    try {
      const result = await resolvePlace(row.id);
      onSelect(result.place);
      selectedQuery.current = result.place.address || result.place.name;
      setQuery(selectedQuery.current);
      setRows([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open that location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-ink-900">
          Search a place or landmark
        </span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-ink-400" />
          <input
            value={query}
            onChange={(event) => {
              selectedQuery.current = null;
              setQuery(event.target.value);
            }}
            maxLength={100}
            autoComplete="off"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listboxId}
            placeholder="Try New Baneshwor, Beltar Bazaar, or a nearby landmark"
            className="w-full rounded-xl border border-ink-200 py-3 pl-10 pr-10 text-sm outline-none focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100"
          />
          {busy && <Loader2 className="absolute right-3.5 top-3.5 h-4 w-4 animate-spin text-crimson-500" />}
        </span>
      </label>
      {rows.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-ink-100 bg-white p-1.5 shadow-float"
        >
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => void choose(row)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-crimson-50 focus:bg-crimson-50 focus:outline-none"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-crimson-500" />
              <span className="min-w-0">
                <strong className="block truncate text-sm text-ink-900">{row.name}</strong>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                  {row.address}
                </span>
              </span>
            </button>
          ))}
          {attribution && (
            <a
              href="https://baato.io"
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2 text-right text-[11px] font-semibold text-ink-500 hover:text-crimson-600"
            >
              {attribution}
            </a>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
    </div>
  );
}
