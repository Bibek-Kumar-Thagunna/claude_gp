/**
 * Demo order history for the customer site.
 *
 * These records exist so every tracking screen — including the live map — can
 * be seen working before the API is connected. Coordinates are real Kathmandu
 * valley pins so the map tiles show the right neighbourhood. Timestamps are
 * derived from a FIXED reference instant, never `Date.now()` at module scope,
 * so the server and the browser render the same first frame.
 */

import { buildRoute, type TrackedOrder } from "./tracking";

/** Fixed "now" for deterministic first paint. The live clock takes over after mount. */
export const NOW = new Date("2026-08-22T10:30:00+05:45");

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

/** Namaste Kirana, Baneshwor → a flat in New Baneshwor. */
const KIRANA = { lat: 27.6893, lng: 85.3436 };
const KIRANA_HOME = { lat: 27.6952, lng: 85.3352 };

/** Himalayan Fresh, Patan → a house in Kupondole. */
const VEG = { lat: 27.6727, lng: 85.3206 };
const VEG_HOME = { lat: 27.6801, lng: 85.3151 };

/** Care Pharmacy, Pulchowk → Jhamsikhel. */
const PHARM = { lat: 27.6767, lng: 85.3159 };
const PHARM_HOME = { lat: 27.6739, lng: 85.3078 };

export const ORDERS: TrackedOrder[] = [
  {
    id: "ord_482913",
    code: "GP482913",
    storeSlug: "namaste-kirana",
    storeName: "Namaste Kirana Pasal",
    storeNp: "नमस्ते किराना पसल",
    storePhone: "9801234567",
    storeArea: "Baneshwor, Kathmandu",
    emoji: "🛒",
    status: "OUT_FOR_DELIVERY",
    deliveryStatus: "EN_ROUTE",
    placedAt: minutesAgo(42),
    origin: KIRANA,
    destination: KIRANA_HOME,
    destinationLabel: "New Baneshwor · Flat 4B, Shanti Marg",
    route: buildRoute(KIRANA, KIRANA_HOME, "GP482913"),
    runner: {
      name: "Ramesh Shrestha",
      phone: "9807654321",
      vehicle: "MOTORBIKE",
      isOwner: false,
    },
    payment: "COD",
    lines: [
      { name: "Basmati Rice (Tilottama)", qty: 2, price: 185, unit: "per kg" },
      { name: "Sunflower Oil (Dhara)", qty: 1, price: 320, unit: "1 L" },
      { name: "Wai Wai Noodles", qty: 6, price: 20, unit: "per pack" },
      { name: "Masala Tea (Tokla)", qty: 1, price: 140, unit: "200 g" },
    ],
    subtotal: 950,
    deliveryFee: 60,
    discount: 50,
    total: 960,
    note: "Please ring the bell twice — the gate is on the side lane.",
  },
  {
    id: "ord_482887",
    code: "GP482887",
    storeSlug: "himalayan-fresh",
    storeName: "Himalayan Fresh Vegetables",
    storeNp: "हिमालयन ताजा तरकारी",
    storePhone: "9812345678",
    storeArea: "Patan, Lalitpur",
    emoji: "🥬",
    status: "PACKED",
    deliveryStatus: "ASSIGNED",
    placedAt: minutesAgo(18),
    origin: VEG,
    destination: VEG_HOME,
    destinationLabel: "Kupondole · House 21, Lane 3",
    route: buildRoute(VEG, VEG_HOME, "GP482887"),
    runner: {
      name: "Sita Maharjan",
      phone: "9845001122",
      vehicle: "SCOOTER",
      isOwner: true,
    },
    payment: "COD",
    lines: [
      { name: "Tomato (Fresh)", qty: 2, price: 80, unit: "per kg" },
      { name: "Cauliflower / Kauli", qty: 1, price: 70, unit: "per kg" },
      { name: "Spinach / Palungo", qty: 3, price: 40, unit: "per bunch" },
    ],
    subtotal: 350,
    deliveryFee: 40,
    discount: 0,
    total: 390,
  },
  {
    id: "ord_481204",
    code: "GP481204",
    storeSlug: "care-pharmacy",
    storeName: "Care Pharmacy & Wellness",
    storeNp: "केयर फार्मेसी",
    storePhone: "9823456789",
    storeArea: "Pulchowk, Lalitpur",
    emoji: "💊",
    status: "DELIVERED",
    deliveryStatus: "DELIVERED",
    placedAt: minutesAgo(60 * 26),
    origin: PHARM,
    destination: PHARM_HOME,
    destinationLabel: "Jhamsikhel · Apartment 2, Green Block",
    route: buildRoute(PHARM, PHARM_HOME, "GP481204"),
    payment: "ESEWA",
    lines: [
      { name: "Paracetamol 500mg", qty: 2, price: 25, unit: "10 tablets" },
      { name: "Vitamin C 1000mg", qty: 1, price: 380, unit: "20 tablets" },
      { name: "ORS Sachet", qty: 4, price: 18, unit: "each" },
    ],
    subtotal: 502,
    deliveryFee: 0,
    discount: 0,
    total: 502,
  },
];

export const orderByCode = (code: string): TrackedOrder | undefined =>
  ORDERS.find((o) => o.code.toLowerCase() === code.toLowerCase() || o.id === code);

export const activeOrders = (): TrackedOrder[] =>
  ORDERS.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED" && o.status !== "REJECTED");

export const pastOrders = (): TrackedOrder[] =>
  ORDERS.filter((o) => o.status === "DELIVERED" || o.status === "CANCELLED" || o.status === "REJECTED");
