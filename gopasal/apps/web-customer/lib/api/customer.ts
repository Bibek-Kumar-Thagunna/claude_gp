import { rawRequest, type ApiUser, type Paginated } from "@gopasal/api-client";
import { authedBlob, authedRequest } from "./client";
import type { Category, Product, Store } from "@/lib/data";

type VariantWire = { id: string; name: string; price: number; mrp: number | null; stock: number };
type ProductWire = {
  id: string;
  name: string;
  nameNp: string | null;
  price: number;
  mrp: number | null;
  unit: string;
  images: string[];
  imageUrls?: string[];
  tags: string[];
  variants: VariantWire[];
  distanceMeters?: number | null;
  shop?: ShopWire;
};
type ShopWire = {
  id: string;
  slug: string;
  name: string;
  nameNp: string | null;
  categoryId: string | null;
  category?: Category | null;
  area: string | null;
  ratingAvg: number;
  ratingCount: number;
  isOpen: boolean;
  hours: string | null;
  emoji: string | null;
  verified: boolean;
  minOrder: number;
  phone: string | null;
  deliveryRadiusKm?: number;
  distanceMeters?: number | null;
};

export type CustomerPoint = { lat: number; lng: number };
export type NearbyProduct = { product: Product; store: Store };
export type DiscoveryHome = {
  location: CustomerPoint;
  shops: Store[];
  shelves: Array<{ category: Category; products: NearbyProduct[] }>;
};
export type DiscoverySearch = {
  query: string;
  locationApplied: boolean;
  shops: Store[];
  products: NearbyProduct[];
};
export type DeliveryQuote = {
  deliverable: boolean;
  distanceMeters?: number;
  etaSeconds?: number;
  etaDegraded?: boolean;
  withinRadius?: boolean;
  zoneMatched?: boolean;
  deliveryRadiusKm?: number;
  fee?: number;
  minOrder?: number;
  reason?: string;
};

export type SavedIds = {
  shopIds: string[];
  productIds: string[];
  totals: { shops: number; products: number };
  truncated: boolean;
};

export type SavedShop = {
  id: string;
  savedAt: string;
  available: boolean;
  store: Store;
};

export type SavedProduct = {
  id: string;
  savedAt: string;
  available: boolean;
  product: Product;
  store: Store;
};

export type GroupDraftItemWire = {
  productId: string;
  variantId: string | null;
  qty: number;
};

export type GroupOrderWire = {
  id: string;
  code: string;
  hostId: string;
  shopId: string;
  status: "OPEN" | "LOCKED" | "PLACED" | "CANCELLED";
  expiresAt: string | null;
  createdAt: string;
  shop: { id: string; name: string; slug: string; minOrder: number };
  participants: Array<{
    id: string;
    userId: string;
    items: GroupDraftItemWire[];
    joinedAt: string;
    user: { name: string | null };
  }>;
  order: { id: string; code: string; status: string } | null;
};

export type GroupPreviewWire = {
  status: GroupOrderWire["status"];
  expiresAt: string | null;
  participantCount: number;
  shop: GroupOrderWire["shop"];
};

const COVERS = [
  "from-crimson-500 to-crimson-700",
  "from-[#0E9F6E] to-[#0B7E58]",
  "from-[#2540E8] to-[#1B31C0]",
  "from-[#F6A609] to-[#D98B00]",
] as const;

function productView(row: ProductWire): Product {
  return {
    id: row.id,
    name: row.name,
    np: row.nameNp ?? undefined,
    price: row.price,
    mrp: row.mrp ?? undefined,
    unit: row.unit,
    image: row.imageUrls?.[0],
    tag: row.tags[0],
    variants: row.variants,
    distanceMeters: row.distanceMeters,
    shop: row.shop
      ? { id: row.shop.id, slug: row.shop.slug, name: row.shop.name, isOpen: row.shop.isOpen }
      : undefined,
  };
}

function storeView(row: ShopWire, products: Product[] = []): Store {
  const shade =
    row.slug.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % COVERS.length;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    np: row.nameNp ?? "",
    category: row.category?.slug ?? "other",
    categoryId: row.categoryId ?? undefined,
    area: row.area ?? "Area not specified",
    rating: row.ratingAvg,
    reviews: row.ratingCount,
    isOpen: row.isOpen,
    hours: row.hours ?? "Contact the shop for hours",
    cover: COVERS[shade]!,
    emoji: row.emoji ?? "🏪",
    verified: row.verified,
    minOrder: row.minOrder,
    deliveryRadiusKm: row.deliveryRadiusKm,
    distanceMeters: row.distanceMeters,
    phone: row.phone ?? undefined,
    products,
  };
}

function pointQuery(point: CustomerPoint): string {
  return new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) }).toString();
}

function nearbyProductView(row: ProductWire): NearbyProduct {
  if (!row.shop) throw new Error("Discovery product is missing its shop");
  return { product: productView(row), store: storeView(row.shop) };
}

function mapPage<A, B>(page: Paginated<A>, map: (row: A) => B): Paginated<B> {
  return { data: page.data.map(map), meta: page.meta };
}

export const listCategories = (signal?: AbortSignal) =>
  rawRequest<Category[]>("/categories", { signal });

export async function listShops(
  categoryId?: string,
  signal?: AbortSignal,
  search?: string,
): Promise<Store[]> {
  const query = new URLSearchParams({ limit: "100" });
  if (categoryId) query.set("categoryId", categoryId);
  if (search?.trim()) query.set("q", search.trim());
  const page = await rawRequest<Paginated<ShopWire>>(`/shops?${query}`, { signal });
  return page.data.map((row) => storeView(row));
}

export async function getShop(slug: string, signal?: AbortSignal): Promise<Store> {
  const path = encodeURIComponent(slug);
  const [shop, products] = await Promise.all([
    rawRequest<ShopWire>(`/shops/${path}`, { signal }),
    rawRequest<Paginated<ProductWire>>(`/shops/${path}/products?limit=100`, { signal }),
  ]);
  return storeView(shop, products.data.map(productView));
}

export async function discoveryHome(
  point: CustomerPoint,
  signal?: AbortSignal,
): Promise<DiscoveryHome> {
  const wire = await rawRequest<{
    location: CustomerPoint;
    shops: ShopWire[];
    shelves: Array<{ category: Category; products: ProductWire[] }>;
  }>(`/discovery/home?${pointQuery(point)}`, { signal });
  return {
    location: wire.location,
    shops: wire.shops.map((shop) => storeView(shop)),
    shelves: wire.shelves.map((shelf) => ({
      category: shelf.category,
      products: shelf.products.map(nearbyProductView),
    })),
  };
}

export async function deliveringShops(
  point: CustomerPoint,
  signal?: AbortSignal,
): Promise<Store[]> {
  const rows = await rawRequest<ShopWire[]>(`/discovery/shops/delivering?${pointQuery(point)}`, {
    signal,
  });
  return rows.map((shop) => storeView(shop));
}

export async function discoverySearch(
  query: string,
  point?: CustomerPoint | null,
  signal?: AbortSignal,
): Promise<DiscoverySearch> {
  const params = new URLSearchParams({ q: query.trim() });
  if (point) {
    params.set("lat", String(point.lat));
    params.set("lng", String(point.lng));
  }
  const wire = await rawRequest<{
    query: string;
    locationApplied: boolean;
    shops: ShopWire[];
    products: ProductWire[];
  }>(`/discovery/search?${params}`, { signal });
  return {
    query: wire.query,
    locationApplied: wire.locationApplied,
    shops: wire.shops.map((shop) => storeView(shop)),
    products: wire.products.map(nearbyProductView),
  };
}

export const reverseGeocode = (point: CustomerPoint, signal?: AbortSignal) =>
  rawRequest<{ address: string | null }>(`/discovery/reverse-geocode?${pointQuery(point)}`, {
    signal,
  });

export type MapSurface = { provider: string; token: string | null; styleUrl?: string };
export type MapConfiguration = MapSurface & {
  surfaces: { pin: MapSurface; tracking: MapSurface };
};

export const mapConfig = (signal?: AbortSignal) =>
  rawRequest<MapConfiguration>(
    "/discovery/map-config",
    { signal },
  );

export type PlaceSuggestion = {
  id: string;
  name: string;
  address: string;
  type?: string;
};

export type ResolvedPlace = PlaceSuggestion & CustomerPoint;

export async function suggestPlaces(
  query: string,
  near?: CustomerPoint | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ q: query.trim() });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lng", String(near.lng));
  }
  return rawRequest<{
    provider: string;
    attribution: string | null;
    suggestions: PlaceSuggestion[];
  }>(`/discovery/places/suggest?${params}`, { signal });
}

export async function resolvePlace(placeId: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ placeId });
  return rawRequest<{
    provider: string;
    attribution: string | null;
    place: ResolvedPlace;
  }>(`/discovery/places/resolve?${params}`, { signal });
}

export const deliveryCheck = (shopId: string, point: CustomerPoint, signal?: AbortSignal) =>
  rawRequest<DeliveryQuote>(
    `/discovery/shops/${encodeURIComponent(shopId)}/delivery-check?${pointQuery(point)}`,
    { signal },
  );

export type Address = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  area: string;
  landmark: string | null;
  fullAddress: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
};

export type AccountDeletionEligibility = {
  eligible: boolean;
  blockers: Array<{ code: string; message: string; count: number }>;
  retained: string[];
};

export type DeletionCodeResult = {
  sent: true;
  cooldownSeconds: number;
  expiresInSeconds: number;
  delivered: boolean;
  developmentCode?: string;
};

export type CartWire = {
  id: string;
  shop: { id: string; name: string; slug: string; minOrder: number; isOpen: boolean } | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    name: string;
    variantName: string | null;
    unit: string;
    image: string | null;
    unitPrice: number;
    qty: number;
    lineTotal: number;
  }>;
  itemCount: number;
  subtotal: number;
  minOrder: number;
  meetsMinOrder: boolean;
};

export type OrderWire = {
  id: string;
  code: string;
  status:
    "PLACED" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "REJECTED";
  paymentMethod: "COD" | "ESEWA" | "KHALTI";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "PARTIALLY_REFUNDED" | "REFUNDED";
  subtotal: number;
  deliveryFee: number;
  discount: number;
  loyaltyDiscount: number;
  loyaltyPointsRedeemed: number;
  total: number;
  recipientName: string;
  recipientPhone: string;
  area: string;
  landmark: string | null;
  fullAddress: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  cancelReason: string | null;
  placedAt: string;
  shop: {
    id: string;
    name: string;
    nameNp?: string | null;
    slug: string;
    phone?: string | null;
    area?: string | null;
    emoji?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  items: Array<{ nameSnapshot: string; unitSnapshot: string; price: number; qty: number }>;
  refunds: Array<{
    id: string;
    code: string;
    amount: number;
    reason: string;
    method: "ORIGINAL_SOURCE" | "MANUAL_TRANSFER" | "STORE_CREDIT";
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    failureReason: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  delivery?: {
    hasProofPhoto: boolean;
    podNote: string | null;
    failReason: string | null;
    pickedUpAt: string | null;
    returnStartedAt: string | null;
    returnedAt: string | null;
    returnNote: string | null;
  } | null;
  tracking?: {
    status: OrderWire["status"];
    deliveryStatus: string | null;
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number } | null;
    route: {
      distanceMeters: number;
      durationSeconds: number;
      geometry: [number, number][] | null;
      degraded: boolean;
    } | null;
    rider: {
      name: string;
      phone: string;
      vehicleType: string;
      lat: number;
      lng: number;
      lastPingAt: string | null;
      stale: boolean;
    } | null;
  };
  payment?: {
    status: string;
    providerRef?: string;
    amount?: number;
    redirectUrl?: string;
    actionUrl?: string;
    formFields?: Record<string, string>;
  };
};

export type NotificationWire = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channel: string;
  readAt: string | null;
  createdAt: string;
};

export type SupportTicketWire = {
  id: string;
  code: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  updatedAt: string;
  messages: Array<{ id: string; body: string; isStaff: boolean; createdAt: string; files?: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }> }>;
};

export type SupportAssistantSessionWire = {
  id: string;
  status: "ACTIVE" | "ESCALATED" | "CLOSED";
  ticketId: string | null;
  knowledgeVersion: string;
  ticket: { id: string; code: string; status: string } | null;
  messages: Array<{
    id: string;
    role: "CUSTOMER" | "ASSISTANT";
    body: string;
    sourceIds: string[];
    sources: Array<{ id: string; title: string }>;
    confidence: number | null;
    provider: "knowledge" | "openai" | null;
    shouldEscalate: boolean;
    escalationReason: string | null;
    createdAt: string;
  }>;
};

export type ReviewWire = {
  id: string;
  orderId: string | null;
  shopId: string;
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  createdAt: string;
};

export type PaymentMethodWire = {
  id: "COD" | "ESEWA" | "KHALTI";
  label: string;
  description: string;
  online: boolean;
};

export type CheckoutQuoteWire = {
  addressId: string;
  shopId: string;
  deliverable: true;
  distanceMeters: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  loyaltyDiscount: number;
  loyaltyPointsRedeemed: number;
  availableGoCoins: number;
  eligibleGoCoins: number;
  eligibleGoCoinsValue: number;
  coinsPerRupee: number;
  total: number;
  couponCode: string | null;
  minOrder: number;
  meetsMinOrder: boolean;
};

export type CouponOfferWire = {
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  validTo: string | null;
  scope: "SHOP" | "PLATFORM";
  title: string;
  detail: string;
};

export type LoyaltySummaryWire = {
  points: number;
  tier: string;
  nextTier: { name: string; pointsAway: number } | null;
  recent: Array<{
    id: string;
    delta: number;
    reason: string;
    orderId: string | null;
    createdAt: string;
  }>;
};

export type ReferralSummaryWire = {
  code: string;
  pending: number;
  rewarded: number;
  rewardPerReferral: number;
  rewardValueRupees: number;
  coinsPerRupee: number;
  qualification: string;
};

export type ReferralHistoryWire = {
  id: string;
  status: "PENDING" | "COMPLETED" | "REWARDED";
  referrerReward: number;
  refereeReward: number;
  createdAt: string;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  referee: { name: string | null } | null;
};

export type ConversationMessageWire = {
  id: string;
  conversationId: string;
  authorId: string;
  sender: "CUSTOMER" | "SHOP" | "SYSTEM";
  body: string;
  clientMessageId: string;
  createdAt: string;
};

export type ShopConversationWire = {
  id: string;
  shopId: string;
  customerId: string;
  orderId: string | null;
  kind: "PRE_ORDER" | "ORDER";
  status: "OPEN" | "CLOSED";
  lastMessageAt: string;
  hasUnread: boolean;
  shop: {
    id: string;
    slug: string;
    name: string;
    nameNp: string | null;
    logoImage: string | null;
    emoji: string | null;
    status: string;
  };
  customer: { id: string; name: string | null; avatarUrl: string | null };
  order: { id: string; code: string; status: string; placedAt: string } | null;
  lastMessage?: ConversationMessageWire | null;
  messages?: ConversationMessageWire[];
};

export const customerApi = {
  profile: () => authedRequest<ApiUser>("/users/me"),
  exportMyData: () => authedBlob("/users/me/data-export"),
  deletionEligibility: () =>
    authedRequest<AccountDeletionEligibility>("/users/me/deletion-eligibility"),
  requestDeletionCode: () =>
    authedRequest<DeletionCodeResult>("/users/me/deletion-code", { method: "POST" }),
  deleteAccount: (body: {
    code: string;
    confirmation: "DELETE MY ACCOUNT";
    acknowledgeRetention: true;
    reason?: string;
  }) =>
    authedRequest<{ deleted: true; retained: string[] }>("/users/me", {
      method: "DELETE",
      body,
    }),
  updateProfile: (body: { name?: string; email?: string; locale?: "en" | "np" }) =>
    authedRequest<ApiUser>("/users/me", { method: "PATCH", body }),
  addresses: () => authedRequest<Address[]>("/users/me/addresses"),
  createAddress: (body: Omit<Address, "id">) =>
    authedRequest<Address>("/users/me/addresses", { method: "POST", body }),
  updateAddress: (id: string, body: Partial<Omit<Address, "id">>) =>
    authedRequest<Address>(`/users/me/addresses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    }),
  setDefaultAddress: (id: string) =>
    authedRequest<{ id: string; isDefault: true }>(
      `/users/me/addresses/${encodeURIComponent(id)}/default`,
      { method: "PUT" },
    ),
  removeAddress: (id: string) =>
    authedRequest<{ deleted: true }>(`/users/me/addresses/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  cart: () => authedRequest<CartWire>("/cart"),
  addCartItem: (productId: string, variantId?: string | null) =>
    authedRequest<CartWire>("/cart/items", {
      method: "POST",
      body: { productId, variantId, qty: 1 },
    }),
  setCartQty: (itemId: string, qty: number) =>
    authedRequest<CartWire>(`/cart/items/${itemId}`, { method: "PATCH", body: { qty } }),
  removeCartItem: (itemId: string) =>
    authedRequest<CartWire>(`/cart/items/${itemId}`, { method: "DELETE" }),
  clearCart: () => authedRequest<CartWire>("/cart", { method: "DELETE" }),
  paymentMethods: (shopId: string) =>
    authedRequest<PaymentMethodWire[]>(`/orders/payment-methods/${encodeURIComponent(shopId)}`),
  publicCoupons: (shopSlug: string) =>
    rawRequest<CouponOfferWire[]>(`/shops/${encodeURIComponent(shopSlug)}/coupons`),
  customerCoupons: (shopSlug: string) =>
    authedRequest<CouponOfferWire[]>(
      `/customer/shops/${encodeURIComponent(shopSlug)}/coupons`,
    ),
  previewCoupon: (couponCode: string) =>
    authedRequest<{ code: string; discount: number }>("/orders/preview-coupon", {
      method: "POST",
      body: { couponCode },
    }),
  checkoutQuote: (
    body: { addressId: string; couponCode?: string; useGoCoins?: boolean },
    signal?: AbortSignal,
  ) =>
    authedRequest<CheckoutQuoteWire>("/orders/checkout/quote", {
      method: "POST",
      body,
      signal,
    }),
  checkout: (body: {
    addressId: string;
    paymentMethod: PaymentMethodWire["id"];
    couponCode?: string;
    note?: string;
    useGoCoins?: boolean;
  }) => authedRequest<OrderWire>("/orders/checkout", { method: "POST", body }),
  orders: () => authedRequest<OrderWire[]>("/orders"),
  order: (id: string) => authedRequest<OrderWire>(`/orders/${encodeURIComponent(id)}`),
  deliveryProof: (id: string) => authedBlob(`/orders/${encodeURIComponent(id)}/delivery-proof`),
  retryGatewayPayment: (id: string) =>
    authedRequest<{ payment: NonNullable<OrderWire["payment"]> }>(
      `/orders/${encodeURIComponent(id)}/payment/retry`,
      { method: "POST" },
    ),
  notifications: () =>
    authedRequest<{ unread: number; items: NotificationWire[] }>("/notifications"),
  notificationCount: () => authedRequest<{ unread: number }>("/notifications/unread-count"),
  markNotificationRead: (id: string) =>
    authedRequest<NotificationWire>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    }),
  markAllNotificationsRead: () =>
    authedRequest<{ updated: number }>("/notifications/read-all", { method: "PATCH" }),
  supportTickets: () => authedRequest<SupportTicketWire[]>("/support/tickets"),
  supportTicket: (id: string) => authedRequest<SupportTicketWire>(`/support/tickets/${encodeURIComponent(id)}`),
  replySupportTicket: (id: string, body: string, file?: File) => {
    const path = `/support/tickets/${encodeURIComponent(id)}/messages`;
    if (!file) return authedRequest<SupportTicketWire>(path, { method: "POST", body: { body } });
    const form = new FormData(); form.append("body", body); form.append("file", file);
    return authedRequest<SupportTicketWire>(`${path}/with-file`, { method: "POST", form });
  },
  supportTicketFile: (ticketId: string, fileId: string) =>
    authedBlob(`/support/tickets/${encodeURIComponent(ticketId)}/files/${encodeURIComponent(fileId)}`),
  createSupportTicket: (body: {
    subject: string;
    category?: string;
    orderId?: string;
    message: string;
  }) => authedRequest<SupportTicketWire>("/support/tickets", { method: "POST", body }),
  currentSupportAssistantSession: () =>
    authedRequest<SupportAssistantSessionWire | null>("/support/assistant/sessions/current"),
  askSupportAssistant: (body: { sessionId?: string; message: string; clientMessageId: string }) =>
    authedRequest<SupportAssistantSessionWire>("/support/assistant/messages", {
      method: "POST",
      body,
    }),
  escalateSupportAssistant: (sessionId: string, body: { subject?: string; reason?: string } = {}) =>
    authedRequest<SupportTicketWire>(
      `/support/assistant/sessions/${encodeURIComponent(sessionId)}/escalate`,
      { method: "POST", body },
    ),
  myReviews: () => authedRequest<ReviewWire[]>("/me/reviews"),
  createReview: (orderId: string, body: { rating: number; comment?: string }) =>
    authedRequest<ReviewWire>(`/orders/${encodeURIComponent(orderId)}/review`, {
      method: "POST",
      body,
    }),
  loyalty: () => authedRequest<LoyaltySummaryWire>("/loyalty"),
  referrals: () => authedRequest<ReferralSummaryWire>("/referrals"),
  referralHistory: () => authedRequest<ReferralHistoryWire[]>("/referrals/history"),
  redeemReferral: (code: string) =>
    authedRequest<{
      referred: true;
      status: "PENDING";
      pendingCoins: number;
      pendingValueRupees: number;
      message: string;
    }>("/referrals/redeem", { method: "POST", body: { code } }),
  conversations: (page = 1) =>
    authedRequest<Paginated<ShopConversationWire>>(`/conversations?page=${page}&limit=50`),
  conversation: (id: string) =>
    authedRequest<ShopConversationWire>(`/conversations/${encodeURIComponent(id)}`),
  startConversation: (body: { shopId: string; orderId?: string; message: string }) =>
    authedRequest<ConversationMessageWire>("/conversations", {
      method: "POST",
      body: {
        shopId: body.shopId,
        orderId: body.orderId,
        body: body.message,
        clientMessageId: crypto.randomUUID(),
      },
    }),
  sendConversationMessage: (id: string, body: string) =>
    authedRequest<ConversationMessageWire>(`/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: { body, clientMessageId: crypto.randomUUID() },
    }),
  markConversationRead: (id: string) =>
    authedRequest<{ ok: true }>(`/conversations/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    }),
  closeConversation: (id: string) =>
    authedRequest<{ ok: true; status: "CLOSED" }>(
      `/conversations/${encodeURIComponent(id)}/close`,
      { method: "PATCH" },
    ),
  savedIds: () => authedRequest<SavedIds>("/saved/ids"),
  savedShops: async (page = 1) => {
    const result = await authedRequest<
      Paginated<{
        id: string;
        savedAt: string;
        available: boolean;
        shop: ShopWire;
      }>
    >(`/saved/shops?page=${page}&limit=40`);
    return mapPage(result, (row): SavedShop => ({
      id: row.id,
      savedAt: row.savedAt,
      available: row.available,
      store: storeView(row.shop),
    }));
  },
  savedProducts: async (page = 1) => {
    const result = await authedRequest<
      Paginated<{
        id: string;
        savedAt: string;
        available: boolean;
        product: ProductWire;
      }>
    >(`/saved/products?page=${page}&limit=40`);
    return mapPage(result, (row): SavedProduct => {
      if (!row.product.shop) throw new Error("Saved product is missing its shop");
      return {
        id: row.id,
        savedAt: row.savedAt,
        available: row.available,
        product: productView(row.product),
        store: storeView(row.product.shop),
      };
    });
  },
  saveShop: (shopId: string) =>
    authedRequest<{ saved: true; shopId: string }>(`/saved/shops/${encodeURIComponent(shopId)}`, {
      method: "PUT",
    }),
  removeSavedShop: (shopId: string) =>
    authedRequest<{ saved: false; shopId: string }>(`/saved/shops/${encodeURIComponent(shopId)}`, {
      method: "DELETE",
    }),
  saveProduct: (productId: string) =>
    authedRequest<{ saved: true; productId: string }>(
      `/saved/products/${encodeURIComponent(productId)}`,
      { method: "PUT" },
    ),
  removeSavedProduct: (productId: string) =>
    authedRequest<{ saved: false; productId: string }>(
      `/saved/products/${encodeURIComponent(productId)}`,
      { method: "DELETE" },
    ),
  groupOrders: () => authedRequest<GroupOrderWire[]>("/group-orders/mine"),
  groupOrder: (id: string) =>
    authedRequest<GroupOrderWire>(`/group-orders/${encodeURIComponent(id)}`),
  groupOrderPreview: (code: string) =>
    authedRequest<GroupPreviewWire>(`/group-orders/code/${encodeURIComponent(code)}`),
  createGroupOrder: (shopId: string, expiresInMinutes = 60) =>
    authedRequest<GroupOrderWire>("/group-orders", {
      method: "POST",
      body: { shopId, expiresInMinutes },
    }),
  joinGroupOrder: (code: string) =>
    authedRequest<GroupOrderWire>("/group-orders/join", {
      method: "POST",
      body: { code },
    }),
  setGroupItems: (id: string, items: GroupDraftItemWire[]) =>
    authedRequest<GroupOrderWire>(`/group-orders/${encodeURIComponent(id)}/items`, {
      method: "POST",
      body: { items },
    }),
  leaveGroupOrder: (id: string) =>
    authedRequest<{ id: string; left: true }>(`/group-orders/${encodeURIComponent(id)}/leave`, {
      method: "POST",
    }),
  lockGroupOrder: (id: string) =>
    authedRequest<GroupOrderWire>(`/group-orders/${encodeURIComponent(id)}/lock`, {
      method: "POST",
    }),
  cancelGroupOrder: (id: string) =>
    authedRequest<GroupOrderWire>(`/group-orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    }),
  groupOrderQuote: (
    id: string,
    body: { addressId: string; couponCode?: string; useGoCoins?: boolean },
    signal?: AbortSignal,
  ) =>
    authedRequest<CheckoutQuoteWire>(`/group-orders/${encodeURIComponent(id)}/quote`, {
      method: "POST",
      body,
      signal,
    }),
  placeGroupOrder: (
    id: string,
    body: {
      addressId: string;
      paymentMethod: PaymentMethodWire["id"];
      couponCode?: string;
      note?: string;
      useGoCoins?: boolean;
    },
  ) =>
    authedRequest<OrderWire>(`/group-orders/${encodeURIComponent(id)}/place`, {
      method: "POST",
      body,
    }),
  cancelOrder: (id: string, reason: string) =>
    authedRequest<OrderWire>(`/orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: { reason },
    }),
};
