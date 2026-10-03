import type { OrderWire } from "@/lib/api/customer";
import type { DeliveryStatus, TrackedOrder } from "./tracking";

/** Adapt the API's immutable order snapshot to the tracking presentation. */
export function orderView(order: OrderWire): TrackedOrder {
  const origin =
    order.tracking?.origin ??
    (order.shop.lat != null && order.shop.lng != null
      ? { lat: order.shop.lat, lng: order.shop.lng }
      : null);
  const destination =
    order.tracking?.destination ??
    (order.lat != null && order.lng != null ? { lat: order.lat, lng: order.lng } : null);
  const rider = order.tracking?.rider;
  const routed = order.tracking?.route;
  return {
    id: order.id,
    code: order.code,
    storeId: order.shop.id,
    storeSlug: order.shop.slug,
    storeName: order.shop.name,
    storeNp: order.shop.nameNp ?? "",
    storePhone: order.shop.phone ?? "",
    storeArea: order.shop.area ?? "",
    emoji: order.shop.emoji ?? "🏪",
    status: order.status,
    deliveryStatus: (order.tracking?.deliveryStatus ?? "UNASSIGNED") as DeliveryStatus,
    placedAt: order.placedAt,
    origin,
    destination,
    destinationLabel: [order.fullAddress, order.area].filter(Boolean).join(" · "),
    route: routed?.geometry?.map(([lng, lat]) => ({ lat, lng })),
    routeDegraded: routed?.degraded ?? true,
    runner: rider
      ? {
          name: rider.name,
          phone: rider.phone,
          vehicle: rider.vehicleType as NonNullable<TrackedOrder["runner"]>["vehicle"],
          isOwner: false,
        }
      : undefined,
    payment: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    lines: order.items.map((item) => ({
      name: item.nameSnapshot,
      qty: item.qty,
      price: item.price,
      unit: item.unitSnapshot,
    })),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    total: order.total,
    note: order.note ?? undefined,
    closeReason: order.cancelReason ?? undefined,
    refunds: order.refunds.map((refund) => ({
      ...refund,
      failureReason: refund.failureReason ?? undefined,
      completedAt: refund.completedAt ?? undefined,
    })),
    hasProofPhoto: order.delivery?.hasProofPhoto ?? false,
    proofNote: order.delivery?.podNote ?? undefined,
    deliveryFailureReason: order.delivery?.failReason ?? undefined,
    pickedUpAt: order.delivery?.pickedUpAt ?? undefined,
    returnStartedAt: order.delivery?.returnStartedAt ?? undefined,
    returnedAt: order.delivery?.returnedAt ?? undefined,
    returnNote: order.delivery?.returnNote ?? undefined,
  };
}

export const isPastOrder = (order: TrackedOrder) =>
  ["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status);
