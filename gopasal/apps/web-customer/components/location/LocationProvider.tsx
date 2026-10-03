"use client";

import * as React from "react";
import { customerApi, type CustomerPoint } from "@/lib/api/customer";
import { useAuth } from "@/components/providers";

const STORAGE_KEY = "gp-delivery-location-v1";

export type DeliveryLocation = CustomerPoint & {
  label: string;
  addressId?: string;
  source: "SAVED_ADDRESS" | "GPS" | "PIN";
};

type LocationContextValue = {
  location: DeliveryLocation | null;
  ready: boolean;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  selectLocation: (location: DeliveryLocation) => void;
  clearLocation: () => void;
};

const LocationContext = React.createContext<LocationContextValue | null>(null);

function storedLocation(): DeliveryLocation | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<DeliveryLocation> | null;
    if (
      !parsed ||
      typeof parsed.lat !== "number" ||
      typeof parsed.lng !== "number" ||
      typeof parsed.label !== "string" ||
      !["SAVED_ADDRESS", "GPS", "PIN"].includes(parsed.source ?? "")
    )
      return null;
    return parsed as DeliveryLocation;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [location, setLocation] = React.useState<DeliveryLocation | null>(null);
  const [ready, setReady] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const selectedAddressId = location?.addressId;
  const preserveManualLocation = Boolean(location && !selectedAddressId);

  React.useEffect(() => {
    setLocation(storedLocation());
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready || auth.status !== "authenticated") return;
    let active = true;
    void customerApi
      .addresses()
      .then((addresses) => {
        if (!active) return;
        const selected = selectedAddressId
          ? addresses.find((address) => address.id === selectedAddressId)
          : addresses.find((address) => address.isDefault);
        if (!selected || selected.lat == null || selected.lng == null) return;
        if (preserveManualLocation) return;
        const next: DeliveryLocation = {
          lat: selected.lat,
          lng: selected.lng,
          label: selected.label || selected.area || "Saved address",
          addressId: selected.id,
          source: "SAVED_ADDRESS",
        };
        setLocation(next);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [auth.status, preserveManualLocation, ready, selectedAddressId]);

  const selectLocation = React.useCallback((next: DeliveryLocation) => {
    setLocation(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPickerOpen(false);
  }, []);

  const clearLocation = React.useCallback(() => {
    setLocation(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        ready,
        pickerOpen,
        openPicker: () => setPickerOpen(true),
        closePicker: () => setPickerOpen(false),
        selectLocation,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useDeliveryLocation() {
  const value = React.useContext(LocationContext);
  if (!value) throw new Error("useDeliveryLocation must be used inside LocationProvider");
  return value;
}
