import type { Paginated } from "@gopasal/api-client";
import { authedBlob, authedRequest } from "./client";

export type RiderStatus = "OFFLINE" | "ONLINE" | "ON_DELIVERY";
export type DeliveryStatus =
  | "ASSIGNED"
  | "PICKED_UP"
  | "EN_ROUTE"
  | "DELIVERED"
  | "FAILED"
  | "RETURNING_TO_SHOP"
  | "RETURNED_TO_SHOP";

export type RiderProfile = {
  id: string;
  vehicleType: "BICYCLE" | "MOTORBIKE" | "SCOOTER" | "WALK" | "VAN";
  status: RiderStatus;
  shop: { id: string; name: string } | null;
  user: { name: string | null; phone: string };
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
    at: string;
    stale: boolean;
    offline: boolean;
  } | null;
};

export type RiderDelivery = {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  destLat: number | null;
  destLng: number | null;
  distanceMeters: number | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  returnStartedAt: string | null;
  returnedAt: string | null;
  failReason: string | null;
  returnNote: string | null;
  podNote: string | null;
  hasProofPhoto: boolean;
  codCollected: boolean;
  codAmount: number;
  updatedAt: string;
  order: {
    code: string;
    status: string;
    recipientName: string;
    recipientPhone: string;
    area: string;
    landmark: string | null;
    fullAddress: string;
    lat: number | null;
    lng: number | null;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    loyaltyDiscount: number;
    total: number;
    paymentMethod: "COD" | "ESEWA" | "KHALTI";
    paymentStatus: string;
    note: string | null;
    placedAt: string;
    shop: {
      id: string;
      name: string;
      area: string | null;
      fullAddress: string | null;
      lat: number | null;
      lng: number | null;
      phone: string | null;
    };
    items: Array<{
      id: string;
      nameSnapshot: string;
      unitSnapshot: string | null;
      price: number;
      qty: number;
    }>;
  };
};

export const riderApi = {
  profile: (signal?: AbortSignal) => authedRequest<RiderProfile>("/rider/me", { signal }),
  active: (signal?: AbortSignal) => authedRequest<RiderDelivery[]>("/rider/deliveries", { signal }),
  history: (page = 1, signal?: AbortSignal) =>
    authedRequest<Paginated<RiderDelivery>>(`/rider/deliveries/history?page=${page}&limit=20`, {
      signal,
    }),
  status: (status: "ONLINE" | "OFFLINE") =>
    authedRequest<RiderProfile>("/rider/status", { method: "PATCH", body: { status } }),
  transition: (
    orderId: string,
    body: {
      status: DeliveryStatus;
      podNote?: string;
      codCollected?: boolean;
      failReason?: string;
      returnNote?: string;
    },
  ) =>
    authedRequest<RiderDelivery>(`/rider/orders/${encodeURIComponent(orderId)}/delivery`, {
      method: "PATCH",
      body,
    }),
  ping: (position: {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
  }) => authedRequest("/rider/ping", { method: "POST", body: position }),
  uploadProof: (orderId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return authedRequest<{ uploaded: true; mimeType: string; size: number }>(
      `/rider/orders/${encodeURIComponent(orderId)}/proof`,
      { method: "POST", form },
    );
  },
  proof: (orderId: string) => authedBlob(`/rider/orders/${encodeURIComponent(orderId)}/proof`),
};
