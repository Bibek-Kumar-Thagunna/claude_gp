"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Crosshair, Loader2, LocateFixed, MapPin, Navigation, X } from "lucide-react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/components/providers";
import { useDeliveryLocation, type DeliveryLocation } from "./LocationProvider";
import { customerApi, type Address, type CustomerPoint } from "@/lib/api/customer";
import { PlaceSearch } from "./PlaceSearch";

const LocationMap = dynamic(() => import("./LocationMap").then((module) => module.LocationMap), {
  ssr: false,
  loading: () => <div className="h-[280px] animate-pulse rounded-2xl bg-ink-100 sm:h-[340px]" />,
});

const KATHMANDU: CustomerPoint = { lat: 27.7172, lng: 85.324 };

function geoMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED)
    return "Location permission was blocked. Allow it in browser settings or place the pin manually.";
  if (error.code === error.POSITION_UNAVAILABLE)
    return "Your device could not find a reliable position. Move near a window and try again.";
  return "Location took too long. Try again or place the pin manually.";
}

export function LocationPicker() {
  const auth = useAuth();
  const { pickerOpen, closePicker, location, selectLocation } = useDeliveryLocation();
  const [addresses, setAddresses] = React.useState<Address[]>([]);
  const [point, setPoint] = React.useState<CustomerPoint>(location ?? KATHMANDU);
  const [pinChosen, setPinChosen] = React.useState(Boolean(location));
  const [label, setLabel] = React.useState(location?.label ?? "");
  const [source, setSource] = React.useState<DeliveryLocation["source"]>(location?.source ?? "PIN");
  const [busy, setBusy] = React.useState(false);
  const [showMap, setShowMap] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (!pickerOpen) return;
    setPoint(location ?? KATHMANDU);
    setPinChosen(Boolean(location));
    setLabel(location?.label ?? "");
    setSource(location?.source ?? "PIN");
    setError(null);
    setShowMap(false);
    window.setTimeout(() => headingRef.current?.focus(), 60);
    if (auth.status === "authenticated") {
      void customerApi
        .addresses()
        .then(setAddresses)
        .catch(() => setAddresses([]));
    }
  }, [auth.status, location, pickerOpen]);

  const useCurrentLocation = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setError(
        "Precise location needs HTTPS and a current browser. You can still place the pin manually.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
        setPinChosen(true);
        setSource("GPS");
        if (!label.trim()) setLabel("Current location");
        setBusy(false);
      },
      (cause) => {
        setError(geoMessage(cause));
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  };

  const chooseAddress = (address: Address) => {
    if (address.lat == null || address.lng == null) {
      setError(`${address.label} has no map pin. Add one from your account first.`);
      return;
    }
    selectLocation({
      lat: address.lat,
      lng: address.lng,
      label: address.label || address.area,
      addressId: address.id,
      source: "SAVED_ADDRESS",
    });
  };

  const confirm = () => {
    if (!pinChosen) {
      setError("Choose a place, use your GPS, or tap the map to set your delivery pin.");
      return;
    }
    const clean = label.trim();
    if (clean.length < 2) {
      setError("Name this delivery location or enter its neighbourhood before continuing.");
      return;
    }
    selectLocation({ ...point, label: clean, source: source === "SAVED_ADDRESS" ? "PIN" : source });
  };

  return (
    <AnimatePresence>
      {pickerOpen && (
        <>
          <motion.button
            type="button"
            aria-label="Close delivery location"
            className="fixed inset-0 z-[100] cursor-default bg-ink-900/45 backdrop-blur-sm"
            onClick={closePicker}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="pointer-events-none fixed inset-0 z-[105] flex items-end justify-center sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="delivery-location-title"
              className="pointer-events-auto max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-float sm:w-[760px] sm:rounded-3xl sm:p-6"
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    id="delivery-location-title"
                    className="text-xl font-extrabold text-ink-900 outline-none"
                  >
                    Where should we deliver?
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    This location controls which shops and products GoPasal shows you.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  aria-label="Close"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-ink-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {addresses.some((address) => address.lat != null && address.lng != null) && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
                    Saved addresses
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {addresses
                      .filter((address) => address.lat != null && address.lng != null)
                      .map((address) => (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => chooseAddress(address)}
                          className="flex min-w-44 items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-left transition hover:border-crimson-300 hover:bg-crimson-50"
                        >
                          <MapPin className="h-4 w-4 shrink-0 text-crimson-500" />
                          <span className="min-w-0">
                            <strong className="block truncate text-sm">{address.label}</strong>
                            <small className="block truncate text-ink-500">{address.area}</small>
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-5">
                <PlaceSearch
                  near={point}
                  onSelect={(place) => {
                    setPoint({ lat: place.lat, lng: place.lng });
                    setPinChosen(true);
                    setLabel(place.type === "GOOGLE" ? "" : place.address || place.name);
                    setSource("PIN");
                    setShowMap(true);
                    setError(null);
                  }}
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-ink-900">
                    Place the pin at your delivery entrance
                  </p>
                  <p className="text-xs text-ink-500">
                    Tap the map or drag the marker to correct it.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={useCurrentLocation}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Crosshair className="h-4 w-4" />
                  )}{" "}
                  Use my location
                </Button>
              </div>

              <div className="mt-3">
                {!showMap && (
                  <button type="button" onClick={() => setShowMap(true)} className="w-full rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-4 py-5 text-sm font-semibold text-ink-700 hover:border-crimson-300 hover:bg-crimson-50">
                    Adjust the exact entrance on a map
                  </button>
                )}
                {showMap && <LocationMap
                  point={point}
                  onChange={(next) => {
                    setPoint(next);
                    setPinChosen(true);
                    setSource("PIN");
                  }}
                />}
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-semibold text-ink-700">
                  Neighbourhood or address label
                </span>
                <div className="relative">
                  <LocateFixed className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-ink-400" />
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={160}
                    placeholder="e.g. Home — New Baneshwor"
                    className="w-full rounded-xl border border-ink-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100"
                  />
                </div>
              </label>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
                <Navigation className="h-3.5 w-3.5" /> Pin: {point.lat.toFixed(5)},{" "}
                {point.lng.toFixed(5)}
              </p>
              {error && (
                <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-ink-100 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={closePicker}>
                  Cancel
                </Button>
                <Button type="button" onClick={confirm}>
                  <Check className="h-4 w-4" /> Deliver here
                </Button>
              </div>
            </motion.section>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
