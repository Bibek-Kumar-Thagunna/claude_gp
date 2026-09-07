/**
 * Mock platform dataset for the GoPasal admin console.
 *
 * Shapes and enum values mirror the real API (apps/api) so that swapping these
 * constants for `fetch("/api/admin/...")` calls is a drop-in change:
 *   ShopStatus  PENDING | ACTIVE | SUSPENDED | REJECTED
 *   UserStatus  ACTIVE | SUSPENDED | DELETED
 *   TicketStatus OPEN | PENDING | RESOLVED | CLOSED
 *   TicketPriority LOW | NORMAL | HIGH | URGENT
 *   DisputeStatus OPEN | UNDER_REVIEW | RESOLVED_CUSTOMER | RESOLVED_SHOP | REJECTED
 *   FraudStatus OPEN | REVIEWING | CONFIRMED | DISMISSED
 *
 * Money is in whole NPR rupees (matching the backend's Int columns).
 */

/* ------------------------------------------------------------------ helpers */

/** Fixed "now" so server and client render identical relative times. */
export const NOW = new Date("2026-08-22T10:30:00+05:45");

/** Minutes/hours/days before NOW, as an ISO string. */
const mAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hAgo = (h: number) => mAgo(h * 60);
const dAgo = (d: number) => mAgo(d * 60 * 24);

/* -------------------------------------------------------------------- shops */

export type ShopStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export type ShopDoc = {
  label: string;
  /** Registration papers uploaded by the applicant. */
  kind: "pan" | "registration" | "citizenship" | "photo";
  verified: boolean;
};

export type PlatformShop = {
  id: string;
  name: string;
  slug: string;
  category: string;
  area: string;
  city: string;
  ownerName: string;
  ownerPhone: string;
  status: ShopStatus;
  verified: boolean;
  createdAt: string;
  approvedAt?: string;
  /** Self-delivery coverage radius, km (SRS Model 4A). */
  radiusKm: number;
  lat: number;
  lng: number;
  products: number;
  orders: number;
  gmv: number;
  ratingAvg: number;
  ratingCount: number;
  accent: string;
  docs: ShopDoc[];
  /** Set when status is REJECTED or SUSPENDED. */
  note?: string;
};

export const SHOPS: PlatformShop[] = [
  {
    id: "shop-namaste",
    name: "Namaste Kirana",
    slug: "namaste-kirana",
    category: "Grocery",
    area: "Baneshwor",
    city: "Kathmandu",
    ownerName: "Ram Bahadur Shrestha",
    ownerPhone: "9811111111",
    status: "ACTIVE",
    verified: true,
    createdAt: dAgo(186),
    approvedAt: dAgo(184),
    radiusKm: 3,
    lat: 27.6935,
    lng: 85.342,
    products: 148,
    orders: 2149,
    gmv: 1_84_62_400,
    ratingAvg: 4.7,
    ratingCount: 612,
    accent: "crimson",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: true },
      { label: "Ward registration", kind: "registration", verified: true },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: true },
    ],
  },
  {
    id: "shop-everest",
    name: "Everest Pharmacy",
    slug: "everest-pharmacy",
    category: "Pharmacy",
    area: "Patan Dhoka",
    city: "Lalitpur",
    ownerName: "Sunita Maharjan",
    ownerPhone: "9812222222",
    status: "ACTIVE",
    verified: true,
    createdAt: dAgo(141),
    approvedAt: dAgo(139),
    radiusKm: 4,
    lat: 27.6725,
    lng: 85.3216,
    products: 96,
    orders: 1387,
    gmv: 1_12_38_900,
    ratingAvg: 4.8,
    ratingCount: 421,
    accent: "green",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: true },
      { label: "Pharmacy licence (DDA)", kind: "registration", verified: true },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: true },
    ],
  },
  {
    id: "shop-freshvalley",
    name: "Fresh Valley Veggies",
    slug: "fresh-valley-veggies",
    category: "Vegetables & Fruit",
    area: "Thamel",
    city: "Kathmandu",
    ownerName: "Kabita Tamang",
    ownerPhone: "9813333333",
    status: "PENDING",
    verified: false,
    createdAt: hAgo(19),
    radiusKm: 2,
    lat: 27.7154,
    lng: 85.3123,
    products: 34,
    orders: 0,
    gmv: 0,
    ratingAvg: 0,
    ratingCount: 0,
    accent: "marigold",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: true },
      { label: "Ward registration", kind: "registration", verified: false },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: true },
    ],
  },
  {
    id: "shop-sunrise",
    name: "Sunrise Bakery",
    slug: "sunrise-bakery",
    category: "Bakery",
    area: "Jhamsikhel",
    city: "Lalitpur",
    ownerName: "Dipesh Rai",
    ownerPhone: "9814444444",
    status: "PENDING",
    verified: false,
    createdAt: hAgo(6),
    radiusKm: 2,
    lat: 27.6784,
    lng: 85.3095,
    products: 22,
    orders: 0,
    gmv: 0,
    ratingAvg: 0,
    ratingCount: 0,
    accent: "blue",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: true },
      { label: "Ward registration", kind: "registration", verified: true },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: false },
    ],
  },
  {
    id: "shop-himal",
    name: "Himal Electronics",
    slug: "himal-electronics",
    category: "Electronics",
    area: "New Road",
    city: "Kathmandu",
    ownerName: "Bikash Gurung",
    ownerPhone: "9815555555",
    status: "PENDING",
    verified: false,
    createdAt: dAgo(2),
    radiusKm: 5,
    lat: 27.7038,
    lng: 85.3095,
    products: 61,
    orders: 0,
    gmv: 0,
    ratingAvg: 0,
    ratingCount: 0,
    accent: "crimson",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: false },
      { label: "Ward registration", kind: "registration", verified: true },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: true },
    ],
  },
  {
    id: "shop-lumbini",
    name: "Lumbini Fresh Mart",
    slug: "lumbini-fresh-mart",
    category: "Grocery",
    area: "Bharatpur",
    city: "Chitwan",
    ownerName: "Prakash Chaudhary",
    ownerPhone: "9816666666",
    status: "SUSPENDED",
    verified: true,
    createdAt: dAgo(97),
    approvedAt: dAgo(95),
    radiusKm: 3,
    lat: 27.6766,
    lng: 84.4322,
    products: 74,
    orders: 318,
    gmv: 21_04_600,
    ratingAvg: 3.4,
    ratingCount: 88,
    accent: "green",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: true },
      { label: "Ward registration", kind: "registration", verified: true },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: true },
    ],
    note: "Suspended after 6 confirmed COD non-delivery reports in 14 days. Under compliance review.",
  },
  {
    id: "shop-pokhara",
    name: "Pokhara Corner Store",
    slug: "pokhara-corner-store",
    category: "Grocery",
    area: "Lakeside",
    city: "Pokhara",
    ownerName: "Nabin Adhikari",
    ownerPhone: "9817777777",
    status: "REJECTED",
    verified: false,
    createdAt: dAgo(31),
    radiusKm: 2,
    lat: 28.2096,
    lng: 83.9556,
    products: 0,
    orders: 0,
    gmv: 0,
    ratingAvg: 0,
    ratingCount: 0,
    accent: "ink",
    docs: [
      { label: "PAN certificate", kind: "pan", verified: false },
      { label: "Ward registration", kind: "registration", verified: false },
      { label: "Owner citizenship", kind: "citizenship", verified: true },
      { label: "Storefront photo", kind: "photo", verified: false },
    ],
    note: "Rejected — PAN certificate did not match the registered business name. Applicant may re-apply.",
  },
];

export const SHOP_BY_ID = new Map(SHOPS.map((s) => [s.id, s]));

/* -------------------------------------------------------------------- users */

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type UserKind = "CUSTOMER" | "SHOP_STAFF" | "PLATFORM_STAFF";

export type PlatformUser = {
  id: string;
  name: string;
  phone: string;
  status: UserStatus;
  kind: UserKind;
  createdAt: string;
  lastSeenAt: string;
  orders: number;
  ownedShops: number;
  spend: number;
  city: string;
  /** Gold subscriber (SRS engagement phase). */
  gold?: boolean;
  note?: string;
};

export const USERS: PlatformUser[] = [
  { id: "u-rina", name: "Rina Shrestha", phone: "9840000001", status: "ACTIVE", kind: "CUSTOMER", createdAt: dAgo(174), lastSeenAt: mAgo(12), orders: 47, ownedShops: 0, spend: 68_420, city: "Kathmandu", gold: true },
  { id: "u-kiran", name: "Kiran Bhandari", phone: "9840000002", status: "ACTIVE", kind: "CUSTOMER", createdAt: dAgo(151), lastSeenAt: hAgo(3), orders: 29, ownedShops: 0, spend: 41_180, city: "Lalitpur" },
  { id: "u-maya", name: "Maya Gurung", phone: "9840000003", status: "ACTIVE", kind: "CUSTOMER", createdAt: dAgo(88), lastSeenAt: hAgo(21), orders: 12, ownedShops: 0, spend: 15_640, city: "Kathmandu" },
  { id: "u-anil", name: "Anil Karki", phone: "9840000004", status: "ACTIVE", kind: "CUSTOMER", createdAt: dAgo(42), lastSeenAt: dAgo(2), orders: 6, ownedShops: 0, spend: 7_310, city: "Bhaktapur" },
  { id: "u-sita", name: "Sita Lama", phone: "9840000005", status: "ACTIVE", kind: "CUSTOMER", createdAt: dAgo(9), lastSeenAt: mAgo(48), orders: 2, ownedShops: 0, spend: 1_980, city: "Kathmandu" },
  { id: "u-binod", name: "Binod Thapa", phone: "9840000006", status: "SUSPENDED", kind: "CUSTOMER", createdAt: dAgo(63), lastSeenAt: dAgo(11), orders: 34, ownedShops: 0, spend: 12_050, city: "Kathmandu", note: "Suspended — 9 COD orders refused at the door within 3 weeks (confirmed fraud flag)." },
  { id: "u-ram", name: "Ram Bahadur Shrestha", phone: "9811111111", status: "ACTIVE", kind: "SHOP_STAFF", createdAt: dAgo(186), lastSeenAt: mAgo(6), orders: 3, ownedShops: 1, spend: 2_400, city: "Kathmandu" },
  { id: "u-manager", name: "Gita Shrestha", phone: "9811111112", status: "ACTIVE", kind: "SHOP_STAFF", createdAt: dAgo(180), lastSeenAt: mAgo(31), orders: 0, ownedShops: 0, spend: 0, city: "Kathmandu" },
  { id: "u-hari", name: "Hari Magar", phone: "9811111120", status: "ACTIVE", kind: "SHOP_STAFF", createdAt: dAgo(120), lastSeenAt: mAgo(2), orders: 0, ownedShops: 0, spend: 0, city: "Kathmandu" },
  { id: "u-sunita", name: "Sunita Maharjan", phone: "9812222222", status: "ACTIVE", kind: "SHOP_STAFF", createdAt: dAgo(141), lastSeenAt: hAgo(2), orders: 1, ownedShops: 1, spend: 890, city: "Lalitpur" },
  { id: "u-kabita", name: "Kabita Tamang", phone: "9813333333", status: "ACTIVE", kind: "SHOP_STAFF", createdAt: hAgo(19), lastSeenAt: hAgo(1), orders: 0, ownedShops: 1, spend: 0, city: "Kathmandu" },
  { id: "u-prakash", name: "Prakash Chaudhary", phone: "9816666666", status: "ACTIVE", kind: "SHOP_STAFF", createdAt: dAgo(97), lastSeenAt: dAgo(4), orders: 0, ownedShops: 1, spend: 0, city: "Chitwan" },
  { id: "u-bibek", name: "Bibek Kumar Thagunna", phone: "9800000001", status: "ACTIVE", kind: "PLATFORM_STAFF", createdAt: dAgo(210), lastSeenAt: mAgo(1), orders: 0, ownedShops: 0, spend: 0, city: "Kathmandu" },
  { id: "u-suyogya", name: "Suyogya Sedhai", phone: "9800000002", status: "ACTIVE", kind: "PLATFORM_STAFF", createdAt: dAgo(210), lastSeenAt: mAgo(17), orders: 0, ownedShops: 0, spend: 0, city: "Kathmandu" },
  { id: "u-asmita", name: "Asmita Joshi", phone: "9800000003", status: "ACTIVE", kind: "PLATFORM_STAFF", createdAt: dAgo(96), lastSeenAt: mAgo(9), orders: 0, ownedShops: 0, spend: 0, city: "Kathmandu" },
];

export const USER_BY_ID = new Map(USERS.map((u) => [u.id, u]));

/* --------------------------------------------------- catalog moderation */

export type ModerationProduct = {
  id: string;
  name: string;
  shopId: string;
  shopName: string;
  category: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  /** Customer reports that put this product in the queue. */
  reports: number;
  reportReason: string;
  severity: "low" | "medium" | "high";
};

export const MODERATION_QUEUE: ModerationProduct[] = [
  {
    id: "p-mod-1",
    name: "Imported Vitamin C 1000mg (loose strip)",
    shopId: "shop-everest",
    shopName: "Everest Pharmacy",
    category: "Pharmacy",
    price: 480,
    isActive: true,
    createdAt: dAgo(4),
    reports: 3,
    reportReason: "Prescription-only medicine listed without a licence note",
    severity: "high",
  },
  {
    id: "p-mod-2",
    name: "Nepali Ghee 1L — 'best in Nepal, doctor approved'",
    shopId: "shop-namaste",
    shopName: "Namaste Kirana",
    category: "Grocery",
    price: 1_450,
    isActive: true,
    createdAt: dAgo(9),
    reports: 2,
    reportReason: "Unverifiable health claim in the product title",
    severity: "medium",
  },
  {
    id: "p-mod-3",
    name: "Branded Powerbank 20000mAh (no brand mark)",
    shopId: "shop-himal",
    shopName: "Himal Electronics",
    category: "Electronics",
    price: 2_190,
    isActive: true,
    createdAt: dAgo(2),
    reports: 5,
    reportReason: "Suspected counterfeit — brand logo removed from photos",
    severity: "high",
  },
  {
    id: "p-mod-4",
    name: "Fresh Tomato 1kg",
    shopId: "shop-lumbini",
    shopName: "Lumbini Fresh Mart",
    category: "Vegetables & Fruit",
    price: 95,
    isActive: false,
    createdAt: dAgo(24),
    reports: 4,
    reportReason: "Photo does not match delivered item (repeat reports)",
    severity: "medium",
  },
  {
    id: "p-mod-5",
    name: "Wai Wai Chicken 5-pack",
    shopId: "shop-namaste",
    shopName: "Namaste Kirana",
    category: "Grocery",
    price: 130,
    isActive: true,
    createdAt: dAgo(37),
    reports: 1,
    reportReason: "Price flagged as far above MRP",
    severity: "low",
  },
];

/* ----------------------------------------------------------------- disputes */

export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED_CUSTOMER"
  | "RESOLVED_SHOP"
  | "REJECTED";

export type DisputeNote = {
  author: string;
  role: "customer" | "shop" | "platform";
  at: string;
  body: string;
};

export type Dispute = {
  id: string;
  orderCode: string;
  orderTotal: number;
  customerName: string;
  customerPhone: string;
  shopId: string;
  shopName: string;
  reason: string;
  detail: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  resolvedBy?: string;
  /** Amount at stake if refunded to the customer. */
  claimAmount: number;
  notes: DisputeNote[];
};

export const DISPUTES: Dispute[] = [
  {
    id: "d-1",
    orderCode: "GP-100482",
    orderTotal: 2_340,
    customerName: "Rina Shrestha",
    customerPhone: "9840000001",
    shopId: "shop-lumbini",
    shopName: "Lumbini Fresh Mart",
    reason: "Item never delivered",
    detail:
      "Order marked delivered by the shop but nothing arrived. Cash was not collected. Customer has requested a full reversal.",
    status: "OPEN",
    createdAt: hAgo(5),
    updatedAt: hAgo(5),
    claimAmount: 2_340,
    notes: [
      { author: "Rina Shrestha", role: "customer", at: hAgo(5), body: "Nobody came. The app says delivered but I never received anything and I paid nothing." },
    ],
  },
  {
    id: "d-2",
    orderCode: "GP-100455",
    orderTotal: 1_890,
    customerName: "Kiran Bhandari",
    customerPhone: "9840000002",
    shopId: "shop-namaste",
    shopName: "Namaste Kirana",
    reason: "Wrong item delivered",
    detail: "Customer ordered 5kg Basmati rice, received 5kg of a different local variety.",
    status: "UNDER_REVIEW",
    createdAt: dAgo(2),
    updatedAt: hAgo(20),
    claimAmount: 640,
    notes: [
      { author: "Kiran Bhandari", role: "customer", at: dAgo(2), body: "Not the rice in the photo. I want the difference back." },
      { author: "Namaste Kirana", role: "shop", at: dAgo(1), body: "Basmati was out of stock, our runner substituted it. We can refund the difference." },
      { author: "Asmita Joshi", role: "platform", at: hAgo(20), body: "Substitution without customer consent breaches the fulfilment policy. Moving to review — likely partial refund." },
    ],
  },
  {
    id: "d-3",
    orderCode: "GP-100390",
    orderTotal: 5_600,
    customerName: "Maya Gurung",
    customerPhone: "9840000003",
    shopId: "shop-everest",
    shopName: "Everest Pharmacy",
    reason: "Damaged on arrival",
    detail: "Glass bottle of syrup arrived cracked and leaking. Photos attached by the customer.",
    status: "RESOLVED_CUSTOMER",
    createdAt: dAgo(9),
    updatedAt: dAgo(7),
    claimAmount: 720,
    resolution: "Full refund of the damaged line item (रु 720) issued to the customer; shop absorbed the cost. Packaging guidance sent to the shop.",
    resolvedBy: "Asmita Joshi",
    notes: [
      { author: "Maya Gurung", role: "customer", at: dAgo(9), body: "Bottle was broken inside the bag." },
      { author: "Asmita Joshi", role: "platform", at: dAgo(7), body: "Photos clearly show transit damage. Refunding the line item to the customer." },
    ],
  },
  {
    id: "d-4",
    orderCode: "GP-100301",
    orderTotal: 980,
    customerName: "Binod Thapa",
    customerPhone: "9840000006",
    shopId: "shop-namaste",
    shopName: "Namaste Kirana",
    reason: "Claims non-delivery",
    detail:
      "Customer claims non-delivery, but the shop supplied a signed proof-of-delivery photo and the COD cash was collected and reconciled.",
    status: "REJECTED",
    createdAt: dAgo(16),
    updatedAt: dAgo(14),
    claimAmount: 980,
    resolution: "Rejected — proof-of-delivery photo and reconciled COD cash confirm handover. Pattern noted on the account.",
    resolvedBy: "Suyogya Sedhai",
    notes: [
      { author: "Namaste Kirana", role: "shop", at: dAgo(15), body: "POD photo attached, cash counted at the counter the same evening." },
      { author: "Suyogya Sedhai", role: "platform", at: dAgo(14), body: "Evidence favours the shop. Fourth such claim from this account — raising a fraud flag." },
    ],
  },
  {
    id: "d-5",
    orderCode: "GP-100266",
    orderTotal: 3_120,
    customerName: "Anil Karki",
    customerPhone: "9840000004",
    shopId: "shop-himal",
    shopName: "Himal Electronics",
    reason: "Item not as described",
    detail: "Powerbank capacity far below the listed 20000mAh according to the customer's own test.",
    status: "RESOLVED_SHOP",
    createdAt: dAgo(21),
    updatedAt: dAgo(18),
    claimAmount: 2_190,
    resolution: "Resolved in the shop's favour after the customer accepted a replacement unit. Listing sent to catalog moderation.",
    resolvedBy: "Asmita Joshi",
    notes: [
      { author: "Anil Karki", role: "customer", at: dAgo(21), body: "It barely charges my phone twice." },
      { author: "Himal Electronics", role: "shop", at: dAgo(19), body: "Faulty unit, we replaced it and the customer confirmed." },
    ],
  },
];

/* -------------------------------------------------------------------- fraud */

export type FraudStatus = "OPEN" | "REVIEWING" | "CONFIRMED" | "DISMISSED";
export type FraudSeverity = "low" | "medium" | "high";

export type FraudFlag = {
  id: string;
  subjectType: "user" | "shop" | "order";
  subjectId: string;
  subjectLabel: string;
  reason: string;
  detail: string;
  severity: FraudSeverity;
  status: FraudStatus;
  reporter: string;
  createdAt: string;
  /** Signals the risk engine matched on. */
  signals: string[];
};

export const FRAUD_FLAGS: FraudFlag[] = [
  {
    id: "f-1",
    subjectType: "user",
    subjectId: "u-binod",
    subjectLabel: "Binod Thapa · 9840000006",
    reason: "Serial COD refusal",
    detail:
      "Nine COD orders refused at the door across four shops in three weeks, each followed by a non-delivery claim.",
    severity: "high",
    status: "CONFIRMED",
    reporter: "Suyogya Sedhai",
    createdAt: dAgo(14),
    signals: ["9 refusals / 21 days", "4 distinct shops", "3 rejected disputes", "same device, 3 phone numbers"],
  },
  {
    id: "f-2",
    subjectType: "shop",
    subjectId: "shop-lumbini",
    subjectLabel: "Lumbini Fresh Mart · Chitwan",
    reason: "Marking orders delivered without handover",
    detail:
      "Six orders marked DELIVERED with no proof-of-delivery capture and no COD reconciliation, all disputed by customers.",
    severity: "high",
    status: "REVIEWING",
    reporter: "Asmita Joshi",
    createdAt: dAgo(6),
    signals: ["6 disputed deliveries / 14 days", "0 POD photos", "COD variance रु 14,200", "rating dropped 4.2 → 3.4"],
  },
  {
    id: "f-3",
    subjectType: "order",
    subjectId: "GP-100501",
    subjectLabel: "Order GP-100501 · रु 48,900",
    reason: "Unusually large first-time COD order",
    detail:
      "New account placed a COD order 22× the platform average within 8 minutes of signup, delivery pin in an unmapped area.",
    severity: "medium",
    status: "OPEN",
    reporter: "Risk engine",
    createdAt: hAgo(3),
    signals: ["account age 8 min", "22× median basket", "COD", "pin outside any shop radius"],
  },
  {
    id: "f-4",
    subjectType: "user",
    subjectId: "u-sita",
    subjectLabel: "Sita Lama · 9840000005",
    reason: "Referral self-dealing",
    detail:
      "Three referral signups traced to the same device fingerprint, each claiming the welcome credit.",
    severity: "medium",
    status: "OPEN",
    reporter: "Risk engine",
    createdAt: hAgo(30),
    signals: ["3 signups / 1 device", "referral credit claimed 3×", "no completed orders"],
  },
  {
    id: "f-5",
    subjectType: "shop",
    subjectId: "shop-himal",
    subjectLabel: "Himal Electronics · New Road",
    reason: "Suspected counterfeit inventory",
    detail: "Multiple listings with brand marks removed from photography; one dispute already upheld on capacity claims.",
    severity: "medium",
    status: "REVIEWING",
    reporter: "Asmita Joshi",
    createdAt: dAgo(3),
    signals: ["5 product reports", "brand marks removed", "1 upheld dispute"],
  },
  {
    id: "f-6",
    subjectType: "order",
    subjectId: "GP-100120",
    subjectLabel: "Order GP-100120 · रु 3,400",
    reason: "Coupon stacking attempt",
    detail: "Four coupon codes replayed against one cart via the API; all but one were correctly rejected server-side.",
    severity: "low",
    status: "DISMISSED",
    reporter: "Risk engine",
    createdAt: dAgo(27),
    signals: ["4 coupon attempts", "rate-limit hit", "no loss incurred"],
  },
];

/* ------------------------------------------------------------------ support */

export type TicketStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TicketMessage = {
  author: string;
  role: "customer" | "shop" | "platform";
  at: string;
  body: string;
};

export type Ticket = {
  id: string;
  code: string;
  subject: string;
  requesterName: string;
  requesterPhone: string;
  requesterKind: "customer" | "seller";
  shopName?: string;
  orderCode?: string;
  category: "order" | "payment" | "account" | "shop" | "app" | "other";
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  assignee?: string;
  messages: TicketMessage[];
};

export const TICKETS: Ticket[] = [
  {
    id: "t-1",
    code: "TK-2041",
    subject: "Rider location not moving on the map",
    requesterName: "Rina Shrestha",
    requesterPhone: "9840000001",
    requesterKind: "customer",
    shopName: "Namaste Kirana",
    orderCode: "GP-100812",
    category: "order",
    status: "OPEN",
    priority: "HIGH",
    createdAt: mAgo(24),
    updatedAt: mAgo(9),
    messages: [
      {
        author: "Rina Shrestha",
        role: "customer",
        at: mAgo(24),
        body: "The order says out for delivery but the rider pin has been at the same spot for 20 minutes. Can someone check?",
      },
      {
        author: "Asmita Joshi",
        role: "platform",
        at: mAgo(9),
        body: "Looking into it now — I can see the rider's last ping was 18 minutes ago, likely a signal drop. Calling the shop.",
      },
    ],
  },
  {
    id: "t-2",
    code: "TK-2040",
    subject: "COD amount collected was higher than the order total",
    requesterName: "Kiran Adhikari",
    requesterPhone: "9840000002",
    requesterKind: "customer",
    shopName: "Everest Pharmacy",
    orderCode: "GP-100804",
    category: "payment",
    status: "PENDING",
    priority: "URGENT",
    createdAt: hAgo(5),
    updatedAt: hAgo(1),
    assignee: "Asmita Joshi",
    messages: [
      {
        author: "Kiran Adhikari",
        role: "customer",
        at: hAgo(5),
        body: "Order total was रु 1,240 but I was asked for रु 1,400 at the door.",
      },
      {
        author: "Asmita Joshi",
        role: "platform",
        at: hAgo(3),
        body: "Thank you for flagging. I have asked the shop for their COD sheet for today.",
      },
      {
        author: "Everest Pharmacy",
        role: "shop",
        at: hAgo(1),
        body: "Our mistake — the rider added a cold-chain charge that we do not charge on GoPasal. We will refund रु 160.",
      },
    ],
  },
  {
    id: "t-3",
    code: "TK-2038",
    subject: "Cannot add a second delivery area to my shop",
    requesterName: "Sunrise Bakery",
    requesterPhone: "9814444444",
    requesterKind: "seller",
    shopName: "Sunrise Bakery",
    category: "shop",
    status: "OPEN",
    priority: "NORMAL",
    createdAt: hAgo(20),
    updatedAt: hAgo(20),
    messages: [
      {
        author: "Sunrise Bakery",
        role: "shop",
        at: hAgo(20),
        body: "We deliver to Jhamsikhel and Sanepa but the radius setting only lets me pick one centre point.",
      },
    ],
  },
  {
    id: "t-4",
    code: "TK-2035",
    subject: "OTP never arrives on Ncell numbers",
    requesterName: "Maya Gurung",
    requesterPhone: "9840000003",
    requesterKind: "customer",
    category: "account",
    status: "RESOLVED",
    priority: "HIGH",
    createdAt: dAgo(2),
    updatedAt: dAgo(1),
    assignee: "Suyogya Sedhai",
    messages: [
      {
        author: "Maya Gurung",
        role: "customer",
        at: dAgo(2),
        body: "I have tried six times, no code arrives. My number is Ncell.",
      },
      {
        author: "Suyogya Sedhai",
        role: "platform",
        at: dAgo(1),
        body: "Our SMS route for Ncell was queueing. Switched to the backup sender and your code should arrive within seconds now.",
      },
      { author: "Maya Gurung", role: "customer", at: dAgo(1), body: "Got it, logged in. Thank you." },
    ],
  },
  {
    id: "t-5",
    code: "TK-2029",
    subject: "Request to change shop name after registration",
    requesterName: "Fresh Valley Veggies",
    requesterPhone: "9813333333",
    requesterKind: "seller",
    shopName: "Fresh Valley Veggies",
    category: "shop",
    status: "CLOSED",
    priority: "LOW",
    createdAt: dAgo(9),
    updatedAt: dAgo(7),
    assignee: "Asmita Joshi",
    messages: [
      {
        author: "Fresh Valley Veggies",
        role: "shop",
        at: dAgo(9),
        body: "We registered as Fresh Valley but our PAN certificate says Fresh Valley Veggies Suppliers.",
      },
      {
        author: "Asmita Joshi",
        role: "platform",
        at: dAgo(7),
        body: "Updated to match the PAN certificate. Your slug stays the same so existing links keep working.",
      },
    ],
  },
  {
    id: "t-6",
    code: "TK-2044",
    subject: "Product photos rejected but no reason given",
    requesterName: "Himal Electronics",
    requesterPhone: "9815555555",
    requesterKind: "seller",
    shopName: "Himal Electronics",
    category: "app",
    status: "OPEN",
    priority: "NORMAL",
    createdAt: mAgo(95),
    updatedAt: mAgo(95),
    messages: [
      {
        author: "Himal Electronics",
        role: "shop",
        at: mAgo(95),
        body: "Five of my listings were hidden this morning. The dashboard just says under review.",
      },
    ],
  },
];

/* ----------------------------------------------------------------- policies */

export type PolicyVersion = {
  version: number;
  title: string;
  isPublished: boolean;
  effectiveAt?: string;
  createdAt: string;
  author: string;
  changeNote: string;
};

export type PolicyDoc = {
  key: string;
  label: string;
  labelNp: string;
  audience: "customer" | "seller" | "both";
  summary: string;
  /** Newest first. */
  versions: PolicyVersion[];
  /** Body of the newest published version, rendered in the viewer. */
  content: string;
};

export const POLICIES: PolicyDoc[] = [
  {
    key: "terms-of-service",
    label: "Terms of Service",
    labelNp: "सेवाका सर्तहरू",
    audience: "both",
    summary: "The master agreement between GoPasal, shoppers and shopkeepers.",
    versions: [
      { version: 4, title: "Terms of Service", isPublished: true, effectiveAt: dAgo(21), createdAt: dAgo(24), author: "Suyogya Sedhai", changeNote: "Clarified that delivery is performed by the shop, not by GoPasal." },
      { version: 3, title: "Terms of Service", isPublished: false, createdAt: dAgo(70), author: "Suyogya Sedhai", changeNote: "Added dispute escalation window." },
      { version: 2, title: "Terms of Service", isPublished: false, createdAt: dAgo(140), author: "Bibek Kumar Thagunna", changeNote: "Added COD handling duties for shops." },
      { version: 1, title: "Terms of Service", isPublished: false, createdAt: dAgo(220), author: "Bibek Kumar Thagunna", changeNote: "Initial publication." },
    ],
    content:
      "GoPasal is a marketplace operated by Velayon Dynamics Pvt. Ltd. that connects you with shops near you. Orders are fulfilled and delivered by the shop you order from. GoPasal does not operate a delivery fleet and does not promise a delivery time on the shop's behalf.",
  },
  {
    key: "privacy-policy",
    label: "Privacy Policy",
    labelNp: "गोपनीयता नीति",
    audience: "both",
    summary: "What we collect, why, how long we keep it, and how location data is handled.",
    versions: [
      { version: 3, title: "Privacy Policy", isPublished: true, effectiveAt: dAgo(21), createdAt: dAgo(23), author: "Suyogya Sedhai", changeNote: "Documented rider live-location retention (24 hours after delivery)." },
      { version: 2, title: "Privacy Policy", isPublished: false, createdAt: dAgo(96), author: "Suyogya Sedhai", changeNote: "Added SMS/OTP provider disclosure." },
      { version: 1, title: "Privacy Policy", isPublished: false, createdAt: dAgo(220), author: "Bibek Kumar Thagunna", changeNote: "Initial publication." },
    ],
    content:
      "While an order is out for delivery, the shop's rider shares their live location with you so you know when to expect them. That location trail is deleted 24 hours after the order is completed and is never shared with other customers or shops.",
  },
  {
    key: "seller-agreement",
    label: "Seller Agreement",
    labelNp: "विक्रेता सम्झौता",
    audience: "seller",
    summary: "Onboarding requirements, commission, COD settlement and suspension grounds.",
    versions: [
      { version: 5, title: "Seller Agreement", isPublished: true, effectiveAt: dAgo(9), createdAt: dAgo(12), author: "Bibek Kumar Thagunna", changeNote: "Weekly COD settlement moved to every Tuesday." },
      { version: 4, title: "Seller Agreement", isPublished: false, createdAt: dAgo(60), author: "Bibek Kumar Thagunna", changeNote: "Added proof-of-delivery requirement." },
      { version: 3, title: "Seller Agreement", isPublished: false, createdAt: dAgo(130), author: "Suyogya Sedhai", changeNote: "Commission tiers by category." },
    ],
    content:
      "Shops set their own delivery radius and their own hours. Commission is charged on the merchandise subtotal only. COD collected by your riders is reconciled and settled every Tuesday for the preceding week.",
  },
  {
    key: "return-refund",
    label: "Return & Refund Policy",
    labelNp: "फिर्ता नीति",
    audience: "both",
    summary: "Which items can be returned, the window, and who bears the cost.",
    versions: [
      { version: 2, title: "Return & Refund Policy", isPublished: true, effectiveAt: dAgo(40), createdAt: dAgo(44), author: "Asmita Joshi", changeNote: "Perishables excluded once accepted at the door." },
      { version: 1, title: "Return & Refund Policy", isPublished: false, createdAt: dAgo(200), author: "Bibek Kumar Thagunna", changeNote: "Initial publication." },
    ],
    content:
      "Check your order at the door. Sealed, non-perishable items can be returned within 48 hours. Fresh produce, bakery, dairy and prescription medicine cannot be returned once accepted, unless the item is damaged or incorrect.",
  },
  {
    key: "community-guidelines",
    label: "Community Guidelines",
    labelNp: "समुदाय निर्देशिका",
    audience: "both",
    summary: "Listing standards, prohibited items and review conduct.",
    versions: [
      { version: 2, title: "Community Guidelines", isPublished: false, createdAt: hAgo(30), author: "Asmita Joshi", changeNote: "DRAFT — adds counterfeit-goods enforcement ladder." },
      { version: 1, title: "Community Guidelines", isPublished: true, effectiveAt: dAgo(150), createdAt: dAgo(154), author: "Suyogya Sedhai", changeNote: "Initial publication." },
    ],
    content:
      "List only what you actually stock, photograph the product you will hand over, and price honestly. Alcohol, tobacco, weapons, wildlife products and counterfeit goods may not be listed on GoPasal.",
  },
];

/* -------------------------------------------------------------------- audit */

export type AuditEntry = {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  entityType: "shop" | "user" | "product" | "dispute" | "fraud" | "policy" | "role" | "coupon" | "ticket";
  entityId: string;
  entityLabel: string;
  surface: "PLATFORM" | "SHOP" | "CUSTOMER";
  ip: string;
  createdAt: string;
  /** Human-readable diff summary shown in the drawer. */
  before?: string;
  after?: string;
};

export const AUDIT_LOG: AuditEntry[] = [
  { id: "a-1", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "shop.suspend", entityType: "shop", entityId: "shop-lumbini", entityLabel: "Lumbini Fresh Mart", surface: "PLATFORM", ip: "27.34.71.12", createdAt: dAgo(6), before: "status: ACTIVE", after: "status: SUSPENDED" },
  { id: "a-2", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "product.moderate", entityType: "product", entityId: "p-9921", entityLabel: "Power bank 30000mAh", surface: "PLATFORM", ip: "27.34.71.12", createdAt: hAgo(4), before: "visible: true", after: "visible: false" },
  { id: "a-3", actor: "Suyogya Sedhai", actorRole: "Super Admin", action: "policy.publish", entityType: "policy", entityId: "privacy-policy", entityLabel: "Privacy Policy v3", surface: "PLATFORM", ip: "202.79.32.8", createdAt: dAgo(21), before: "published: v2", after: "published: v3" },
  { id: "a-4", actor: "Bibek Kumar Thagunna", actorRole: "Super Admin", action: "rbac.role.update", entityType: "role", entityId: "support-agent", entityLabel: "Support Agent", surface: "PLATFORM", ip: "202.79.32.9", createdAt: dAgo(11), before: "permissions: 4", after: "permissions: 5 (+disputes.view)" },
  { id: "a-5", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "shop.approve", entityType: "shop", entityId: "shop-everest", entityLabel: "Everest Pharmacy", surface: "PLATFORM", ip: "27.34.71.12", createdAt: dAgo(34), before: "status: PENDING", after: "status: ACTIVE" },
  { id: "a-6", actor: "Suyogya Sedhai", actorRole: "Super Admin", action: "user.suspend", entityType: "user", entityId: "u-binod", entityLabel: "Binod Thapa", surface: "PLATFORM", ip: "202.79.32.8", createdAt: dAgo(14), before: "status: ACTIVE", after: "status: SUSPENDED" },
  { id: "a-7", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "dispute.resolve", entityType: "dispute", entityId: "d-3", entityLabel: "Dispute on GP-100655", surface: "PLATFORM", ip: "27.34.71.12", createdAt: dAgo(4), before: "status: UNDER_REVIEW", after: "status: RESOLVED_CUSTOMER" },
  { id: "a-8", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "fraud.status", entityType: "fraud", entityId: "f-6", entityLabel: "Coupon stacking on GP-100120", surface: "PLATFORM", ip: "27.34.71.12", createdAt: dAgo(26), before: "status: OPEN", after: "status: DISMISSED" },
  { id: "a-9", actor: "Bibek Kumar Thagunna", actorRole: "Super Admin", action: "coupon.create", entityType: "coupon", entityId: "DASHAIN20", entityLabel: "DASHAIN20 — 20% off, cap रु 300", surface: "PLATFORM", ip: "202.79.32.9", createdAt: dAgo(19), after: "active: true, budget: रु 400000" },
  { id: "a-10", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "shop.reject", entityType: "shop", entityId: "shop-pokhara", entityLabel: "Pokhara Corner Store", surface: "PLATFORM", ip: "27.34.71.12", createdAt: dAgo(17), before: "status: PENDING", after: "status: REJECTED" },
  { id: "a-11", actor: "Suyogya Sedhai", actorRole: "Super Admin", action: "rbac.staff.invite", entityType: "user", entityId: "u-asmita", entityLabel: "Asmita Joshi → Operations Admin", surface: "PLATFORM", ip: "202.79.32.8", createdAt: dAgo(60), after: "role: Operations Admin" },
  { id: "a-12", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "ticket.respond", entityType: "ticket", entityId: "t-2", entityLabel: "TK-2040 COD overcharge", surface: "PLATFORM", ip: "27.34.71.12", createdAt: hAgo(3), before: "status: OPEN", after: "status: PENDING" },
  { id: "a-13", actor: "Asmita Joshi", actorRole: "Operations Admin", action: "product.moderate", entityType: "product", entityId: "p-9925", entityLabel: "Homemade pickle 500g", surface: "PLATFORM", ip: "27.34.71.12", createdAt: mAgo(50), before: "visible: true", after: "visible: false" },
  { id: "a-14", actor: "Bibek Kumar Thagunna", actorRole: "Super Admin", action: "policy.publish", entityType: "policy", entityId: "seller-agreement", entityLabel: "Seller Agreement v5", surface: "PLATFORM", ip: "202.79.32.9", createdAt: dAgo(9), before: "published: v4", after: "published: v5" },
  { id: "a-15", actor: "Suyogya Sedhai", actorRole: "Super Admin", action: "shop.approve", entityType: "shop", entityId: "shop-namaste", entityLabel: "Namaste Kirana", surface: "PLATFORM", ip: "202.79.32.8", createdAt: dAgo(58), before: "status: PENDING", after: "status: ACTIVE" },
];

/* ---------------------------------------------------------------- analytics */

/** Mirrors GET /api/admin/analytics/orders-trend → { day, orders, gmv }[] */
export type TrendPoint = { day: string; orders: number; gmv: number };

function trend(days: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(NOW.getTime() - i * 86400000);
    const dow = d.getDay();
    // Friday/Saturday are the busy days in Nepal; add a gentle growth ramp.
    const weekend = dow === 5 || dow === 6 ? 1.34 : dow === 0 ? 0.88 : 1;
    const ramp = 1 + (days - i) / (days * 3.2);
    const wobble = 0.9 + ((i * 37) % 21) / 100;
    const orders = Math.round(96 * weekend * ramp * wobble);
    const gmv = Math.round(orders * (960 + ((i * 53) % 260)));
    out.push({ day: d.toISOString().slice(0, 10), orders, gmv });
  }
  return out;
}

export const ORDERS_TREND_30 = trend(30);
export const ORDERS_TREND_7 = ORDERS_TREND_30.slice(-7);

export type PlatformOverview = {
  gmv: number;
  orders: { total: number; last7Days: number; byStatus: Record<string, number> };
  shops: { total: number; pending: number; active: number; suspended: number };
  users: { active: number; newLast7Days: number };
  riders: number;
  aov: number;
  commission: number;
  codShare: number;
};

const gmv30 = ORDERS_TREND_30.reduce((s, p) => s + p.gmv, 0);
const orders30 = ORDERS_TREND_30.reduce((s, p) => s + p.orders, 0);
const orders7 = ORDERS_TREND_7.reduce((s, p) => s + p.orders, 0);

/** Mirrors GET /api/admin/overview. */
export const OVERVIEW: PlatformOverview = {
  gmv: gmv30,
  orders: {
    total: orders30 + 4820,
    last7Days: orders7,
    byStatus: {
      PLACED: 34,
      CONFIRMED: 61,
      PREPARING: 48,
      OUT_FOR_DELIVERY: 27,
      DELIVERED: orders30 - 214,
      CANCELLED: 39,
      RETURNED: 5,
    },
  },
  shops: {
    total: SHOPS.length,
    pending: SHOPS.filter((s) => s.status === "PENDING").length,
    active: SHOPS.filter((s) => s.status === "ACTIVE").length,
    suspended: SHOPS.filter((s) => s.status === "SUSPENDED").length,
  },
  users: {
    active: USERS.filter((u) => u.status === "ACTIVE").length + 12480,
    newLast7Days: 486,
  },
  riders: 38,
  aov: Math.round(gmv30 / orders30),
  commission: Math.round(gmv30 * 0.081),
  codShare: 78.4,
};

export type CategorySlice = { label: string; labelNp: string; orders: number; gmv: number; tone: string };

export const CATEGORY_MIX: CategorySlice[] = [
  { label: "Grocery & kirana", labelNp: "किराना", orders: 1284, gmv: 1_186_400, tone: "crimson" },
  { label: "Fresh produce", labelNp: "तरकारी", orders: 742, gmv: 468_900, tone: "green" },
  { label: "Pharmacy", labelNp: "औषधि", orders: 431, gmv: 612_300, tone: "blue" },
  { label: "Bakery & sweets", labelNp: "बेकरी", orders: 388, gmv: 241_700, tone: "marigold" },
  { label: "Electronics", labelNp: "इलेक्ट्रोनिक्स", orders: 96, gmv: 894_200, tone: "ink" },
];

export type CitySlice = { city: string; shops: number; orders: number; gmv: number };

export const CITY_MIX: CitySlice[] = [
  { city: "Kathmandu", shops: 214, orders: 2140, gmv: 2_284_600 },
  { city: "Lalitpur", shops: 96, orders: 861, gmv: 921_400 },
  { city: "Bhaktapur", shops: 41, orders: 302, gmv: 268_900 },
  { city: "Pokhara", shops: 58, orders: 344, gmv: 372_100 },
  { city: "Chitwan", shops: 33, orders: 187, gmv: 164_800 },
  { city: "Biratnagar", shops: 22, orders: 121, gmv: 108_400 },
];

/* ------------------------------------------------------------------ finance */

export type SettlementStatus = "DUE" | "PROCESSING" | "PAID" | "HELD";

export type Settlement = {
  id: string;
  shopId: string;
  shopName: string;
  periodStart: string;
  periodEnd: string;
  orders: number;
  gross: number;
  commission: number;
  codCollected: number;
  onlineCollected: number;
  /** Positive = GoPasal owes the shop; negative = the shop owes GoPasal (COD float). */
  net: number;
  status: SettlementStatus;
  paidAt?: string;
  note?: string;
};

export const SETTLEMENTS: Settlement[] = [
  { id: "st-1", shopId: "shop-namaste", shopName: "Namaste Kirana", periodStart: dAgo(7), periodEnd: dAgo(1), orders: 148, gross: 164_200, commission: 13_136, codCollected: 131_400, onlineCollected: 32_800, net: -118_264, status: "DUE" },
  { id: "st-2", shopId: "shop-everest", shopName: "Everest Pharmacy", periodStart: dAgo(7), periodEnd: dAgo(1), orders: 96, gross: 142_800, commission: 10_710, codCollected: 98_600, onlineCollected: 44_200, net: -87_890, status: "DUE" },
  { id: "st-3", shopId: "shop-namaste", shopName: "Namaste Kirana", periodStart: dAgo(14), periodEnd: dAgo(8), orders: 139, gross: 151_900, commission: 12_152, codCollected: 118_200, onlineCollected: 33_700, net: -106_048, status: "PAID", paidAt: dAgo(6) },
  { id: "st-4", shopId: "shop-everest", shopName: "Everest Pharmacy", periodStart: dAgo(14), periodEnd: dAgo(8), orders: 88, gross: 128_400, commission: 9_630, codCollected: 86_100, onlineCollected: 42_300, net: -76_470, status: "PAID", paidAt: dAgo(6) },
  { id: "st-5", shopId: "shop-lumbini", shopName: "Lumbini Fresh Mart", periodStart: dAgo(14), periodEnd: dAgo(8), orders: 42, gross: 38_600, commission: 3_088, codCollected: 36_400, onlineCollected: 2_200, net: -33_312, status: "HELD", note: "Held pending fraud review f-2 (COD variance रु 14,200)." },
  { id: "st-6", shopId: "shop-namaste", shopName: "Namaste Kirana", periodStart: dAgo(21), periodEnd: dAgo(15), orders: 131, gross: 141_300, commission: 11_304, codCollected: 110_900, onlineCollected: 30_400, net: -99_596, status: "PAID", paidAt: dAgo(13) },
  { id: "st-7", shopId: "shop-himal", shopName: "Himal Electronics", periodStart: dAgo(7), periodEnd: dAgo(1), orders: 11, gross: 214_600, commission: 21_460, codCollected: 96_000, onlineCollected: 118_600, net: 1_140, status: "PROCESSING" },
];

export type PaymentMethodSlice = { method: string; label: string; orders: number; amount: number; tone: string };

export const PAYMENT_MIX: PaymentMethodSlice[] = [
  { method: "COD", label: "Cash on delivery", orders: 2284, amount: 2_186_400, tone: "crimson" },
  { method: "WALLET", label: "Digital wallet", orders: 486, amount: 604_100, tone: "green" },
  { method: "CARD", label: "Card", orders: 118, amount: 231_800, tone: "blue" },
  { method: "BANK", label: "Bank transfer", orders: 24, amount: 96_400, tone: "ink" },
];

export type CodFloatDay = { day: string; collected: number; remitted: number };

export const COD_FLOAT: CodFloatDay[] = ORDERS_TREND_7.map((p, i) => ({
  day: p.day,
  collected: Math.round(p.gmv * 0.784),
  remitted: Math.round(p.gmv * (i < 5 ? 0.74 : 0.31)),
}));

export const FINANCE_SUMMARY = {
  gmv30: gmv30,
  commission30: Math.round(gmv30 * 0.081),
  codOutstanding: SETTLEMENTS.filter((s) => s.status === "DUE" || s.status === "PROCESSING").reduce(
    (s, x) => s + Math.max(0, -x.net),
    0,
  ),
  heldAmount: SETTLEMENTS.filter((s) => s.status === "HELD").reduce((s, x) => s + Math.max(0, -x.net), 0),
  refunds30: 42_600,
  couponSpend30: 138_900,
};

/* -------------------------------------------------------------------- staff */

export type StaffStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export type StaffMember = {
  id: string;
  name: string;
  phone: string;
  email: string;
  roleId: string;
  status: StaffStatus;
  joinedAt: string;
  lastActiveAt?: string;
  invitedBy?: string;
};

export const PLATFORM_STAFF: StaffMember[] = [
  { id: "u-bibek", name: "Bibek Kumar Thagunna", phone: "9800000001", email: "bibek@velayon.com", roleId: "super-admin", status: "ACTIVE", joinedAt: dAgo(220), lastActiveAt: mAgo(12) },
  { id: "u-suyogya", name: "Suyogya Sedhai", phone: "9800000002", email: "suyogya@velayon.com", roleId: "super-admin", status: "ACTIVE", joinedAt: dAgo(220), lastActiveAt: hAgo(2) },
  { id: "u-asmita", name: "Asmita Joshi", phone: "9800000003", email: "asmita@gopasal.com", roleId: "operations-admin", status: "ACTIVE", joinedAt: dAgo(60), lastActiveAt: mAgo(38), invitedBy: "Suyogya Sedhai" },
  { id: "u-nabin", name: "Nabin Rai", phone: "9800000004", email: "nabin@gopasal.com", roleId: "support-agent", status: "ACTIVE", joinedAt: dAgo(41), lastActiveAt: hAgo(6), invitedBy: "Asmita Joshi" },
  { id: "u-pratik", name: "Pratik Karki", phone: "9800000005", email: "pratik@gopasal.com", roleId: "compliance-reviewer", status: "ACTIVE", joinedAt: dAgo(28), lastActiveAt: dAgo(1), invitedBy: "Bibek Kumar Thagunna" },
  { id: "u-sneha", name: "Sneha Bhattarai", phone: "9800000006", email: "sneha@velayon.com", roleId: "finance-viewer", status: "ACTIVE", joinedAt: dAgo(22), lastActiveAt: dAgo(2), invitedBy: "Bibek Kumar Thagunna" },
  { id: "u-rojan", name: "Rojan Shakya", phone: "9800000007", email: "rojan@gopasal.com", roleId: "support-agent", status: "INVITED", joinedAt: dAgo(1), invitedBy: "Asmita Joshi" },
  { id: "u-deepak", name: "Deepak Thapa", phone: "9800000008", email: "deepak@gopasal.com", roleId: "operations-admin", status: "SUSPENDED", joinedAt: dAgo(150), lastActiveAt: dAgo(31), invitedBy: "Suyogya Sedhai" },
];

/** The signed-in operator for this local build (swap for the /api/auth/me payload). */
export const CURRENT_ADMIN = {
  id: "u-bibek",
  name: "Bibek Kumar Thagunna",
  phone: "9800000001",
  email: "bibek@velayon.com",
  roleId: "super-admin",
};

/* ------------------------------------------------------------------ coupons */

export type CouponStatus = "ACTIVE" | "SCHEDULED" | "PAUSED" | "EXPIRED";

export type PlatformCoupon = {
  id: string;
  code: string;
  description: string;
  kind: "percent" | "flat" | "free-delivery";
  value: number;
  capAmount?: number;
  minOrder: number;
  budget: number;
  spent: number;
  redemptions: number;
  maxRedemptions?: number;
  perUserLimit: number;
  startsAt: string;
  endsAt: string;
  status: CouponStatus;
  cities: string[];
  createdBy: string;
};

export const PLATFORM_COUPONS: PlatformCoupon[] = [
  { id: "c-1", code: "DASHAIN20", description: "Dashain festival — 20% off, capped at रु 300", kind: "percent", value: 20, capAmount: 300, minOrder: 800, budget: 400_000, spent: 138_900, redemptions: 612, maxRedemptions: 2000, perUserLimit: 2, startsAt: dAgo(19), endsAt: dAgo(-11), status: "ACTIVE", cities: ["Kathmandu", "Lalitpur", "Bhaktapur"], createdBy: "Bibek Kumar Thagunna" },
  { id: "c-2", code: "NAYASATHI", description: "First order — रु 150 off for new shoppers", kind: "flat", value: 150, minOrder: 500, budget: 250_000, spent: 96_450, redemptions: 643, perUserLimit: 1, startsAt: dAgo(64), endsAt: dAgo(-56), status: "ACTIVE", cities: [], createdBy: "Suyogya Sedhai" },
  { id: "c-3", code: "TIHARFREE", description: "Tihar — delivery fee waived", kind: "free-delivery", value: 0, minOrder: 600, budget: 180_000, spent: 0, redemptions: 0, perUserLimit: 3, startsAt: dAgo(-24), endsAt: dAgo(-14), status: "SCHEDULED", cities: ["Kathmandu", "Pokhara"], createdBy: "Bibek Kumar Thagunna" },
  { id: "c-4", code: "PHARMA10", description: "Pharmacy category — 10% off, capped at रु 200", kind: "percent", value: 10, capAmount: 200, minOrder: 400, budget: 120_000, spent: 41_200, redemptions: 288, perUserLimit: 4, startsAt: dAgo(40), endsAt: dAgo(-4), status: "PAUSED", cities: ["Kathmandu", "Lalitpur"], createdBy: "Asmita Joshi" },
  { id: "c-5", code: "SAWAN15", description: "Monsoon — 15% off, capped at रु 250", kind: "percent", value: 15, capAmount: 250, minOrder: 700, budget: 300_000, spent: 297_800, redemptions: 1418, maxRedemptions: 1500, perUserLimit: 2, startsAt: dAgo(96), endsAt: dAgo(34), status: "EXPIRED", cities: [], createdBy: "Suyogya Sedhai" },
];

/* ----------------------------------------------------------------- counters */

/** Sidebar / topbar badge counts derived from the data above. */
export const COUNTS = {
  pendingShops: SHOPS.filter((s) => s.status === "PENDING").length,
  moderationQueue: MODERATION_QUEUE.filter((p) => p.isActive).length,
  openDisputes: DISPUTES.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW").length,
  openFraud: FRAUD_FLAGS.filter((f) => f.status === "OPEN" || f.status === "REVIEWING").length,
  openTickets: TICKETS.filter((t) => t.status === "OPEN" || t.status === "PENDING").length,
  draftPolicies: POLICIES.filter((p) => p.versions.some((v) => !v.isPublished && v.version > (p.versions.find((x) => x.isPublished)?.version ?? 0))).length,
  heldSettlements: SETTLEMENTS.filter((s) => s.status === "HELD").length,
};
