/**
 * The customer surface of the API, as typed calls and React Query hooks.
 *
 * Shapes are declared against what the server actually sends. Where the wire
 * type already exists in `@gopasal/api-client` it is imported rather than
 * redeclared, so the phone and the web consoles cannot drift.
 *
 * Reads are hooks with a `staleTime` chosen per kind of data (see `STALE`).
 * Writes are plain functions, because the screen decides whether a given write
 * goes through the outbox — adding to a cart does, previewing a coupon does
 * not, and that is a product decision rather than a transport one.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyQtyChange } from "./cart-math";
import type { Paginated } from "@gopasal/api-client/types";
import { STALE, useGopasal } from "./GopasalProvider";
import { FALLBACK_POINT } from "./location";
import { ApiError, type Session } from "./http";
import { appendFilePart, type FilePart } from "./file-part";

/* ── wire shapes ──────────────────────────────────────────────────────────── */

export type ShopCategory = {
  id: string;
  slug: string;
  en: string;
  np: string;
  /** Lucide icon name chosen by the shop's category. */
  icon: string;
  /** Palette hint from the API — 'amber', 'green', … */
  hue: string;
  sortOrder?: number;
};

export type Shop = {
  id: string;
  slug: string;
  name: string;
  nameNp?: string | null;
  description?: string | null;
  area: string;
  emoji?: string | null;
  isOpen: boolean;
  hours?: string | null;
  minOrder: number;
  deliveryRadiusKm: number;
  coverImage?: string | null;
  logoImage?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  category?: ShopCategory | null;
  _count?: { products: number } | null;
  /** Metres from the point the query carried. */
  distanceMeters?: number | null;
  /** `GET /shops` spells the same thing this way. */
  distance?: number | null;
  lat?: number | null;
  lng?: number | null;
  /** Only `GET /shops/:slug` carries these. */
  phone?: string | null;
  fullAddress?: string | null;
  verified?: boolean;
  codEnabled?: boolean;
  onlinePaymentEnabled?: boolean;
};

/** A category's products, as `GET /discovery/home` groups them. */
export type HomeShelf = {
  category: ShopCategory;
  products: (Product & { shopSlug?: string; shopName?: string })[];
};

export type HomeFeed = {
  location: { lat: number; lng: number } | null;
  shops: Shop[];
  shelves: HomeShelf[];
};

/**
 * An offer, as the customer coupon endpoints return it.
 *
 * `scope: "PLATFORM"` means GoPasal funds it and it applies at any shop;
 * `"SHOP"` means that one shop does. The distinction is worth showing, because
 * a customer who taps a shop-funded offer needs to end up at that shop.
 */
export type Offer = {
  code: string;
  type: "FLAT" | "PERCENT" | string;
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  validTo: string | null;
  scope: "PLATFORM" | "SHOP" | string;
  title: string;
  detail: string;
};

export type Product = {
  id: string;
  name: string;
  nameNp?: string | null;
  description?: string | null;
  price: number;
  mrp?: number | null;
  unit?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  inStock?: boolean;
  stock?: number | null;
  trackStock?: boolean;
  categoryId?: string | null;
  /**
   * Sizes, weights, packs. A product that has any is only sellable *through*
   * one of them — the server rejects a group line with no variantId and prices
   * a cart line by the variant — so anything that offers a product to a
   * customer has to offer the options, not the product.
   */
  variants?: ProductVariant[] | null;
};

export type ProductVariant = {
  id: string;
  name: string;
  price: number;
  mrp?: number | null;
  stock?: number | null;
  isActive?: boolean;
};

/**
 * A cart line, exactly as `GET /cart` sends it.
 *
 * Flat, not nested. The server denormalises the product onto the line — `name`,
 * `unit`, `unitPrice`, `lineTotal` — rather than embedding the whole product,
 * and that is the right shape for a cart: the line records what was added *at
 * the time it was added*, so a price change on the shelf cannot silently rewrite
 * a basket somebody is looking at.
 */
export type CartLine = {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unit: string | null;
  image: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
};

/**
 * The cart, with its totals already worked out by the server.
 *
 * `subtotal`, `itemCount` and `meetsMinOrder` are not conveniences to ignore in
 * favour of client-side arithmetic — they are the same numbers checkout will
 * use. Recomputing them here would be a second implementation to keep in step,
 * and the first divergence would show up as a total that changes between the
 * cart screen and the checkout screen.
 */
export type Cart = {
  id: string;
  shop: {
    id: string;
    name: string;
    slug: string;
    minOrder: number;
    isOpen: boolean;
    deliveryRadiusKm: number;
    lat: number | null;
    lng: number | null;
  } | null;
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  minOrder: number;
  meetsMinOrder: boolean;
  updatedAt: string;
};

export type Address = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  area: string;
  fullAddress: string;
  landmark?: string | null;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
};

export type CheckoutQuote = {
  addressId: string;
  shopId: string;
  deliverable: boolean;
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

export type OrderStatus =
  "PLACED" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "REJECTED";

export type OrderTracking = {
  status: OrderStatus;
  deliveryStatus: string | null;
  destination: { lat: number; lng: number } | null;
  origin: { lat: number; lng: number } | null;
  route: {
    distanceMeters: number;
    durationSeconds: number;
    geometry: [number, number][] | null;
    degraded: boolean;
  } | null;
  rider: {
    name: string;
    phone: string;
    vehicleType?: string | null;
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    lastPingAt: string | null;
    stale: boolean;
  } | null;
};

/**
 * A line on an order, exactly as the API sends it.
 *
 * `nameSnapshot` and `unitSnapshot`, not `name` and `unit` — and that naming is
 * the point rather than an inconvenience. An order records what was bought at
 * the moment it was bought; if the shop later renames the product or changes
 * its pack size, a six-month-old receipt must still say what the customer
 * actually received. The app renders the snapshot for the same reason.
 *
 * There is no `lineTotal` on the wire, so `price × qty` is computed here. That
 * is the one piece of money arithmetic the app is allowed to do: it is exact,
 * both operands come from the server, and the figure that actually matters —
 * the order total — is still the server's own.
 */
export type OrderItem = {
  id: string;
  productId: string;
  variantId: string | null;
  nameSnapshot: string;
  unitSnapshot?: string | null;
  price: number;
  qty: number;
};

export function lineTotal(item: OrderItem): number {
  return item.price * item.qty;
}

export type OrderRefund = {
  id: string;
  code: string;
  amount: number;
  status: string;
  createdAt: string;
};

export type Order = {
  id: string;
  code: string;
  status: OrderStatus;
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
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  loyaltyDiscount?: number;
  loyaltyPointsRedeemed?: number;
  total: number;
  paymentMethod: "COD" | "ESEWA" | "KHALTI" | string;
  paymentStatus?: string;
  coupon?: { code: string } | null;
  note?: string | null;
  /** The delivery address, snapshotted onto the order. */
  recipientName?: string | null;
  recipientPhone?: string | null;
  area?: string | null;
  fullAddress?: string | null;
  landmark?: string | null;
  lat?: number | null;
  lng?: number | null;
  placedAt: string;
  acceptedAt?: string | null;
  packedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  events?: { id: string; type: string; note?: string | null; createdAt: string }[];
  refunds?: OrderRefund[];
  tracking?: OrderTracking;
};

export type PaymentMethod = {
  id: string;
  label: string;
  description: string;
  online: boolean;
};

/* ── keys ─────────────────────────────────────────────────────────────────── */

export const qk = {
  home: (lat?: number, lng?: number) => ["home", lat ?? null, lng ?? null] as const,
  shops: (lat?: number, lng?: number) => ["shops", lat ?? null, lng ?? null] as const,
  shop: (slug: string) => ["shop", slug] as const,
  products: (slug: string) => ["products", slug] as const,
  cart: () => ["cart"] as const,
  addresses: () => ["addresses"] as const,
  orders: () => ["orders"] as const,
  order: (id: string) => ["order", id] as const,
  paymentMethods: (shopId: string) => ["payment-methods", shopId] as const,
  quote: (addressId: string, coupon: string | null, coins: boolean) =>
    ["quote", addressId, coupon, coins] as const,
};

/* ── auth ─────────────────────────────────────────────────────────────────── */

export type RequestOtpResult = {
  sent: true;
  cooldownSeconds: number;
  expiresInSeconds: number;
  delivered: boolean;
  developmentCode?: string;
};

export function useAuth() {
  const { http, session } = useGopasal();
  const qc = useQueryClient();

  return {
    // No `surface` here. `RequestOtpDto` accepts only `phone` and `purpose`,
    // and the API runs `forbidNonWhitelisted`, so sending the extra field is a
    // 400 rather than a harmless ignore — which is the correct strictness, and
    // exactly the trait that makes the tampering attacks fail. `VerifyOtpDto`
    // *does* take a surface, so it is sent one step later.
    requestOtp: (phone: string) =>
      http.request<RequestOtpResult>("/auth/otp/request", {
        method: "POST",
        body: { phone },
        anonymous: true,
      }),

    verifyOtp: async (phone: string, code: string) => {
      const result = await http.request<{
        user: Session["user"];
        tokens: { accessToken: string; refreshToken: string; expiresIn: number };
        isNewUser: boolean;
      }>("/auth/otp/verify", {
        method: "POST",
        body: { phone, code, surface: "customer" },
        anonymous: true,
      });
      await session.set({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        accessExpiresAt: Date.now() + result.tokens.expiresIn * 1000,
        user: result.user,
      });
      // Anything cached while signed out belonged to nobody; a signed-in cart
      // and address list are different data entirely.
      await qc.invalidateQueries();
      return result;
    },
  };
}

/* ── discovery ────────────────────────────────────────────────────────────── */

export function useShops(point?: { lat: number; lng: number } | null) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: qk.shops(point?.lat, point?.lng),
    staleTime: STALE.catalog,
    queryFn: () => {
      // Coordinates are rounded before they leave the device. Three decimals is
      // ~110 m, which is the right resolution for "shops near me" and, because
      // the server caches by request parameters, it also means a street shares
      // one cached answer instead of buying one per handset. It keeps a precise
      // GPS fix out of a URL, too.
      const q = point ? `?lat=${point.lat.toFixed(3)}&lng=${point.lng.toFixed(3)}` : "";
      return http.request<Paginated<Shop>>(`/shops${q}`);
    },
  });
}

/**
 * The home feed: nearby shops and category shelves in one request.
 *
 * One call rather than three. On a 3G link the cost of a screen is dominated by
 * the number of round trips it makes, not the bytes it moves, and the server is
 * already assembling all of this from one database.
 */
export function useHome(point?: { lat: number; lng: number } | null) {
  const { http } = useGopasal();
  // `GET /discovery/home` requires lat/lng — a request without them is a 400,
  // not an unqualified feed. There is always a point to send (see
  // `location.ts`: a saved address, a fix, or Kathmandu as an admitted guess),
  // so the fallback here is belt-and-braces rather than the normal path.
  const where = point ?? FALLBACK_POINT;
  const lat = Number(where.lat.toFixed(3));
  const lng = Number(where.lng.toFixed(3));

  return useQuery({
    queryKey: qk.home(lat, lng),
    staleTime: STALE.catalog,
    queryFn: () => {
      // Rounded to ~110 m before it leaves the device: the right resolution for
      // "near me", a shared cache key for a whole street, and no precise GPS fix
      // in a URL. See docs/maps-cost-policy.md.
      return http.request<HomeFeed>(`/discovery/home?lat=${lat}&lng=${lng}`);
    },
  });
}

/**
 * The whole shop taxonomy.
 *
 * Deliberately not derived from whatever the home feed happened to return.
 * Building the category grid out of the feed means a neighbourhood with two
 * shops shows two categories, which reads as "this app sells two things" rather
 * than "two of these are open near you". The full list is small, changes about
 * never, and is cached for a day — so the grid is stable, complete and free.
 */
export function useCategories() {
  const { http } = useGopasal();
  return useQuery({
    queryKey: ["categories"] as const,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => http.request<ShopCategory[]>("/categories"),
  });
}

/** Offers available at a shop, including the platform-funded ones. */
export function useOffers(shopSlug: string | null | undefined) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: ["offers", shopSlug ?? null] as const,
    staleTime: STALE.catalog,
    enabled: Boolean(shopSlug),
    queryFn: () => http.request<Offer[]>(`/shops/${encodeURIComponent(shopSlug!)}/coupons`),
  });
}

export function useShop(slug: string) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: qk.shop(slug),
    staleTime: STALE.catalog,
    enabled: Boolean(slug),
    queryFn: () => http.request<Shop>(`/shops/${encodeURIComponent(slug)}`),
  });
}

export function useShopProducts(slug: string) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: qk.products(slug),
    staleTime: STALE.catalog,
    enabled: Boolean(slug),
    queryFn: () =>
      http.request<Paginated<Product>>(`/shops/${encodeURIComponent(slug)}/products?limit=100`),
  });
}

/* ── cart ─────────────────────────────────────────────────────────────────── */

export function useCart() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.cart(),
    staleTime: STALE.mine,
    enabled: Boolean(user),
    queryFn: () => http.request<Cart>("/cart"),
  });
}

/**
 * Cart mutations, applied optimistically and queued when offline.
 *
 * Optimistic because a cart tap must feel instant — waiting 400ms for a server
 * round trip before a quantity changes is the single most common way a native
 * app feels worse than it is. Queued because the alternative on a dropped
 * connection is losing the tap silently.
 */
export function useCartMutations() {
  const { http, outbox } = useGopasal();
  const qc = useQueryClient();

  const patchLocal = (fn: (cart: Cart) => Cart) => {
    qc.setQueryData<Cart>(qk.cart(), (current) => (current ? fn(current) : current));
  };

  const settle = () => qc.invalidateQueries({ queryKey: qk.cart() });

  return {
    add: useMutation({
      mutationFn: (input: { productId: string; variantId?: string; qty?: number; label: string }) =>
        outbox.enqueue<Cart>({
          path: "/cart/items",
          method: "POST",
          body: { productId: input.productId, variantId: input.variantId, qty: input.qty ?? 1 },
          label: `Add ${input.label}`,
        }),
      onSettled: settle,
    }),

    setQty: useMutation({
      mutationFn: (input: { itemId: string; qty: number; label: string }) =>
        input.qty <= 0
          ? outbox.enqueue<Cart>({
              path: `/cart/items/${encodeURIComponent(input.itemId)}`,
              method: "DELETE",
              label: `Remove ${input.label}`,
            })
          : outbox.enqueue<Cart>({
              path: `/cart/items/${encodeURIComponent(input.itemId)}`,
              method: "PATCH",
              body: { qty: input.qty },
              label: `Update ${input.label}`,
            }),
      onMutate: async ({ itemId, qty }) => {
        await qc.cancelQueries({ queryKey: qk.cart() });
        const previous = qc.getQueryData<Cart>(qk.cart());
        patchLocal((cart) => applyQtyChange(cart, itemId, qty));
        return { previous };
      },
      onError: (_e, _v, context) => {
        // Put it back exactly as it was. A cart that silently keeps a quantity
        // the server rejected is worse than one that visibly reverts.
        if (context?.previous) qc.setQueryData(qk.cart(), context.previous);
      },
      onSettled: settle,
    }),

    clear: useMutation({
      mutationFn: () => http.request<void>("/cart", { method: "DELETE" }),
      onSettled: settle,
    }),
  };
}

/* ── addresses ────────────────────────────────────────────────────────────── */

export function useAddresses() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.addresses(),
    staleTime: STALE.mine,
    enabled: Boolean(user),
    queryFn: async () => {
      const result = await http.request<Paginated<Address> | Address[]>("/users/me/addresses");
      return Array.isArray(result) ? result : result.data;
    },
  });
}

/* ── checkout ─────────────────────────────────────────────────────────────── */

export function usePaymentMethods(shopId: string | null | undefined) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: qk.paymentMethods(shopId ?? ""),
    staleTime: STALE.catalog,
    enabled: Boolean(shopId),
    queryFn: () =>
      http.request<PaymentMethod[]>(`/orders/payment-methods/${encodeURIComponent(shopId!)}`),
  });
}

export function useQuote(input: {
  addressId: string | null;
  couponCode?: string | null;
  useGoCoins?: boolean;
  enabled?: boolean;
}) {
  const { http } = useGopasal();
  const coupon = input.couponCode?.trim() || null;
  return useQuery({
    queryKey: qk.quote(input.addressId ?? "", coupon, Boolean(input.useGoCoins)),
    enabled: Boolean(input.addressId) && input.enabled !== false,
    // The total is money. It is never served from a stale cache — the server
    // re-prices the cart on every quote, and it is checked again at placement.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      http.request<CheckoutQuote>("/orders/checkout/quote", {
        method: "POST",
        body: {
          addressId: input.addressId,
          useGoCoins: Boolean(input.useGoCoins),
          ...(coupon ? { couponCode: coupon } : {}),
        },
      }),
  });
}

/* ── orders ───────────────────────────────────────────────────────────────── */

export function useOrders() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.orders(),
    staleTime: STALE.orders,
    enabled: Boolean(user),
    queryFn: async () => {
      const result = await http.request<Paginated<Order> | Order[]>("/orders");
      return Array.isArray(result) ? result : result.data;
    },
  });
}

export function useOrder(id: string, options?: { pollMs?: number }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: qk.order(id),
    staleTime: STALE.orders,
    enabled: Boolean(id) && Boolean(user),
    // Polling is the fallback for when the socket is down. When it is up, the
    // socket invalidates this key and the poll is redundant — which is why the
    // caller passes a long interval for a settled order and a short one only
    // while something is actually moving.
    refetchInterval: options?.pollMs,
    queryFn: () => http.request<Order>(`/orders/${encodeURIComponent(id)}`),
  });
}

/* ── messaging ────────────────────────────────────────────────────────────── */

export type ConversationSender = "CUSTOMER" | "SHOP";

export type ChatMessage = {
  id: string;
  authorId: string | null;
  sender: ConversationSender;
  body: string;
  clientMessageId: string;
  createdAt: string;
  /** Set by the client only: this message has not reached the server yet. */
  pending?: boolean;
  /** Set by the client only: the send failed and is waiting to retry. */
  failed?: boolean;
};

export type Conversation = {
  id: string;
  kind: "SHOP" | "ORDER" | string;
  status: "OPEN" | "CLOSED" | string;
  shop: {
    id: string;
    slug: string;
    name: string;
    nameNp?: string | null;
    logoImage?: string | null;
    emoji?: string | null;
    status?: string;
  };
  order?: { id: string; code: string; status: OrderStatus; placedAt: string } | null;
  lastMessage?: ChatMessage | null;
  lastMessageAt?: string | null;
  hasUnread: boolean;
};

export type ConversationDetail = Omit<Conversation, "lastMessage"> & {
  messages: ChatMessage[];
};

export const chatKeys = {
  list: () => ["conversations"] as const,
  detail: (id: string) => ["conversation", id] as const,
};

/**
 * A client id that makes a send safe to repeat.
 *
 * `POST /conversations/:id/messages` is keyed on `(conversationId,
 * clientMessageId)`, so the same id twice is the same message — which is what
 * lets a send sit in the outbox through a tunnel and go out on the other side
 * without the shopkeeper receiving it twice.
 */
export function newClientMessageId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // The server validates this as a v4 UUID, so the fallback has to be shaped
  // like one rather than being any unique string.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/**
 * My conversations with shops.
 *
 * `poll` is passed by the screen rather than being always-on: expo-router keeps
 * screens mounted behind the one on top, so a hook that polled unconditionally
 * would keep hitting the server from three screens down the stack.
 */
export function useConversations(options?: { poll?: boolean }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: chatKeys.list(),
    enabled: Boolean(user),
    staleTime: 15_000,
    refetchInterval: options?.poll ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const result = await http.request<Paginated<Conversation> | Conversation[]>(
        "/conversations?limit=50",
      );
      return Array.isArray(result) ? result : result.data;
    },
  });
}

/** Unread badge for the inbox entry points, from the cached list. */
export function useUnreadConversations(): number {
  const { data } = useConversations();
  return (data ?? []).filter((c) => c.hasUnread).length;
}

export function useConversation(id: string, options?: { poll?: boolean }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: chatKeys.detail(id),
    enabled: Boolean(id) && Boolean(user),
    staleTime: 5_000,
    refetchInterval: options?.poll ? 5_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () => http.request<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`),
  });
}

/**
 * Sending, optimistically and durably.
 *
 * The bubble appears the moment it is typed and goes through the outbox, so a
 * message written in a lift is still sent when the lift doors open. Until the
 * server confirms it, the bubble is marked pending and says so — a chat that
 * shows a sent message which never arrived is worse than one that admits it is
 * still trying.
 */
export function useSendMessage(conversationId: string) {
  const { http, outbox } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      const clientMessageId = newClientMessageId();
      return outbox.enqueue<ChatMessage>({
        path: `/conversations/${encodeURIComponent(conversationId)}/messages`,
        method: "POST",
        body: { body, clientMessageId },
        idempotencyKey: clientMessageId,
        label: "Your message",
      });
    },
    onMutate: async (body: string) => {
      await qc.cancelQueries({ queryKey: chatKeys.detail(conversationId) });
      const optimistic: ChatMessage = {
        id: `pending-${newClientMessageId()}`,
        authorId: null,
        sender: "CUSTOMER",
        body,
        clientMessageId: "",
        createdAt: new Date().toISOString(),
        pending: true,
      };
      qc.setQueryData<ConversationDetail>(chatKeys.detail(conversationId), (current) =>
        current ? { ...current, messages: [...current.messages, optimistic] } : current,
      );
      return { optimisticId: optimistic.id };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.detail(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

/**
 * Open a conversation with a shop, or continue the existing one.
 *
 * The server upserts on `(shop, customer, context)`, so "start" is the same
 * call whether this is the first message or the fiftieth — there is no separate
 * "do I already have a thread with this shop" request to make first.
 */
export function useStartConversation() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { shopId: string; body: string; orderId?: string }) =>
      http.request<ChatMessage & { conversationId: string }>("/conversations", {
        method: "POST",
        body: {
          shopId: input.shopId,
          body: input.body,
          clientMessageId: newClientMessageId(),
          ...(input.orderId ? { orderId: input.orderId } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

export function useMarkConversationRead() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      http.request<unknown>(`/conversations/${encodeURIComponent(conversationId)}/read`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

/* ── saved ────────────────────────────────────────────────────────────────── */

export type SavedIds = { shopIds: string[]; productIds: string[] };

export function useSavedIds() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["saved-ids"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: () => http.request<SavedIds>("/saved/ids"),
  });
}

/**
 * The heart, applied optimistically.
 *
 * Saving is a one-tap, low-stakes action people do while scrolling, so it must
 * not wait for a round trip — and if the write fails the heart goes back, which
 * is the honest outcome rather than a save that silently did not happen.
 */
export function useToggleSavedShop() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ shopId, saved }: { shopId: string; saved: boolean }) =>
      http.request<unknown>(`/saved/shops/${encodeURIComponent(shopId)}`, {
        method: saved ? "DELETE" : "PUT",
      }),
    onMutate: async ({ shopId, saved }) => {
      await qc.cancelQueries({ queryKey: ["saved-ids"] });
      const previous = qc.getQueryData<SavedIds>(["saved-ids"]);
      qc.setQueryData<SavedIds>(["saved-ids"], (current) =>
        current
          ? {
              ...current,
              shopIds: saved
                ? current.shopIds.filter((id) => id !== shopId)
                : [...current.shopIds, shopId],
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(["saved-ids"], context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["saved-ids"] });
    },
  });
}

/** The same heart, on a product. Same optimism, same rollback. */
export function useToggleSavedProduct() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, saved }: { productId: string; saved: boolean }) =>
      http.request<unknown>(`/saved/products/${encodeURIComponent(productId)}`, {
        method: saved ? "DELETE" : "PUT",
      }),
    onMutate: async ({ productId, saved }) => {
      await qc.cancelQueries({ queryKey: ["saved-ids"] });
      const previous = qc.getQueryData<SavedIds>(["saved-ids"]);
      qc.setQueryData<SavedIds>(["saved-ids"], (current) =>
        current
          ? {
              ...current,
              productIds: saved
                ? current.productIds.filter((id) => id !== productId)
                : [...current.productIds, productId],
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(["saved-ids"], context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["saved-ids"] });
      void qc.invalidateQueries({ queryKey: ["saved-products"] });
    },
  });
}

/* ── one product ──────────────────────────────────────────────────────────── */

export type ProductDetail = Product & {
  tags?: string[] | null;
  isActive?: boolean;
  shop: { id: string; name: string; slug: string };
  imageUrls?: string[] | null;
};

/**
 * A product on its own.
 *
 * The shelf row has to fit a name, a price and a stepper in 56 points, so
 * everything a seller writes about what they are selling — the description, the
 * other photographs, the full list of sizes — has nowhere to go there. This is
 * where it goes.
 */
export function useProduct(id: string) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: ["product", id] as const,
    enabled: Boolean(id),
    staleTime: STALE.catalog,
    queryFn: () => http.request<ProductDetail>(`/products/${encodeURIComponent(id)}`),
  });
}

/* ── loyalty ──────────────────────────────────────────────────────────────── */

export type Loyalty = {
  /** GoCoins. The API calls them points; the product calls them GoCoins. */
  points: number;
  tier: string;
  nextTier?: { name: string; pointsAway: number } | null;
  recent?: { id: string; delta: number; reason: string; createdAt: string }[];
};

/**
 * The GoCoins balance.
 *
 * Kept fresh-ish rather than live: coins change when an order is delivered or
 * redeemed, both of which already invalidate their own queries. Polling a
 * balance that moves a few times a month would be a request per minute for
 * nothing.
 */
export function useLoyalty() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["loyalty"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: () => http.request<Loyalty>("/loyalty"),
  });
}

export type Referrals = {
  code: string;
  pending: number;
  rewarded: number;
  rewardPerReferral: number;
  rewardValueRupees: number;
  coinsPerRupee: number;
  qualification: string;
};

export type LoyaltyEntry = {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
  orderId?: string | null;
};

export function useReferrals() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["referrals"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: () => http.request<Referrals>("/referrals"),
  });
}

/**
 * Claim a friend's referral code. Only before the first order — the API says
 * so in words ("Referral codes must be claimed before your first order"), which
 * the screen shows as-is. The coins are pending until that first order is
 * delivered, so the balance does not move here; the referrals card does.
 */
export function useRedeemReferral() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      http.request<{ referred: true; status: string; pendingCoins: number; message: string }>(
        "/referrals/redeem",
        { method: "POST", body: { code: code.trim() } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["referrals"] });
      void qc.invalidateQueries({ queryKey: ["loyalty"] });
      void qc.invalidateQueries({ queryKey: ["loyalty-ledger"] });
    },
  });
}

export function useLoyaltyLedger() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["loyalty-ledger"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: async () => {
      const result = await http.request<Paginated<LoyaltyEntry> | LoyaltyEntry[]>(
        "/loyalty/ledger",
      );
      return Array.isArray(result) ? result : result.data;
    },
  });
}

/* ── address writes ───────────────────────────────────────────────────────── */

export type AddressInput = {
  label?: string;
  recipientName: string;
  phone: string;
  area: string;
  fullAddress: string;
  landmark?: string;
  lat?: number;
  lng?: number;
};

/**
 * Creating, editing and choosing a delivery address.
 *
 * Not routed through the outbox, deliberately. The cart queues because a
 * quantity tap is fire-and-forget; an address is something the customer is
 * standing there filling in, and silently queueing it would let them walk into
 * checkout believing they have an address the server has never seen. A failure
 * here has to be visible in the moment.
 */
export function useAddressMutations() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: qk.addresses() });

  return {
    create: useMutation({
      mutationFn: (input: AddressInput) =>
        http.request<Address>("/users/me/addresses", { method: "POST", body: input }),
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: AddressInput & { id: string }) =>
        http.request<Address>(`/users/me/addresses/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: input,
        }),
      onSuccess: settle,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        http.request<unknown>(`/users/me/addresses/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      onSuccess: settle,
    }),
    makeDefault: useMutation({
      mutationFn: (id: string) =>
        http.request<unknown>(`/users/me/addresses/${encodeURIComponent(id)}/default`, {
          method: "PUT",
        }),
      onSuccess: settle,
    }),
  };
}

/* ── finding a place ──────────────────────────────────────────────────────── */

export type PlaceSuggestion = {
  id: string;
  name: string;
  address: string;
  type?: string | null;
};

export type ResolvedPlace = PlaceSuggestion & { lat: number; lng: number };

/**
 * Address autocomplete — the escape hatch, not the front door.
 *
 * Every keystroke here can cost a provider credit, and a GPS fix costs nothing
 * and is more accurate for the informal addressing most of Nepal uses. So this
 * hook is deliberately hard to fire by accident:
 *
 *  - it is disabled until the caller turns it on, which the address screen only
 *    does once the customer has asked to search;
 *  - it needs three characters, so "ba" never leaves the phone;
 *  - the caller debounces the term before passing it in;
 *  - results are cached for an hour and never refetched on focus, because a
 *    place does not move and the second lookup of "Baneshwor" should be free.
 *
 * The bias point is rounded to three decimals (~110 m) by the server, so a
 * customer's exact position is not part of the upstream request.
 */
export function useSuggestPlaces(
  query: string,
  near?: { lat: number; lng: number } | null,
  enabled = true,
) {
  const { http } = useGopasal();
  const term = query.trim();
  return useQuery({
    queryKey: ["places", term, near ? [round3(near.lat), round3(near.lng)] : null],
    enabled: enabled && term.length >= 3,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () => {
      const params = new URLSearchParams({ q: term });
      if (near) {
        params.set("lat", String(round3(near.lat)));
        params.set("lng", String(round3(near.lng)));
      }
      return http.request<{
        provider: string;
        attribution: string | null;
        suggestions: PlaceSuggestion[];
      }>(`/discovery/places/suggest?${params.toString()}`);
    },
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Turn a chosen suggestion into a pin. One call, only on an actual choice. */
export function useResolvePlace() {
  const { http } = useGopasal();
  return useMutation({
    mutationFn: (placeId: string) =>
      http.request<{ provider: string; attribution: string | null; place: ResolvedPlace }>(
        `/discovery/places/resolve?placeId=${encodeURIComponent(placeId)}`,
      ),
  });
}

/* ── placing the order ────────────────────────────────────────────────────── */

export type PlacedOrder = Order & { payment?: { redirectUrl?: string | null } | null };

export type CheckoutInput = {
  addressId: string;
  paymentMethod: string;
  couponCode?: string | null;
  note?: string | null;
  useGoCoins?: boolean;
};

/**
 * Checkout.
 *
 * The one write in the app that must never happen twice. It carries an
 * `Idempotency-Key` generated once per attempt and reused across every retry of
 * that attempt, so a reply lost to a dropped connection cannot become a second
 * order — the server replays the first one instead. The key is minted when the
 * customer taps, not when the screen mounts, so a genuine second order placed
 * deliberately still goes through.
 *
 * It is also not queued. An order placed silently twenty minutes later, from a
 * cart that has since changed and at prices that have since moved, is not a
 * kindness. If the connection is gone the customer is told.
 */
export function usePlaceOrder() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const idempotencyKey = newClientMessageId();
      const coupon = input.couponCode?.trim() || null;
      const note = input.note?.trim() || null;
      return http.request<PlacedOrder>("/orders/checkout", {
        method: "POST",
        idempotencyKey,
        body: {
          addressId: input.addressId,
          paymentMethod: input.paymentMethod,
          useGoCoins: Boolean(input.useGoCoins),
          ...(coupon ? { couponCode: coupon } : {}),
          ...(note ? { note } : {}),
        },
      });
    },
    onSuccess: () => {
      // The cart is emptied server-side by a successful checkout, and coins and
      // orders both moved — so none of the three may be served from cache.
      void qc.invalidateQueries({ queryKey: qk.cart() });
      void qc.invalidateQueries({ queryKey: qk.orders() });
      void qc.invalidateQueries({ queryKey: ["loyalty"] });
    },
  });
}

/** Check a coupon against the current cart without committing to it. */
export function usePreviewCoupon() {
  const { http } = useGopasal();
  return useMutation({
    mutationFn: (couponCode: string) =>
      http.request<{ valid: boolean; discount: number; message?: string }>(
        "/orders/preview-coupon",
        { method: "POST", body: { couponCode } },
      ),
  });
}

/** Offers this customer can still redeem at a shop (excludes ones already used). */
export function useMyOffers(shopSlug: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["my-offers", shopSlug ?? null] as const,
    staleTime: STALE.mine,
    enabled: Boolean(shopSlug) && Boolean(user),
    queryFn: () =>
      http.request<Offer[]>(`/customer/shops/${encodeURIComponent(shopSlug!)}/coupons`),
  });
}

/** Cancelling, while the shop has not yet sent it out. */
export function useCancelOrder(orderId: string) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      http.request<Order>(`/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.order(orderId) });
      void qc.invalidateQueries({ queryKey: qk.orders() });
    },
  });
}

/** Leave a review on a delivered order. */
export function useReviewOrder(orderId: string) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; comment?: string }) =>
      http.request<unknown>(`/orders/${encodeURIComponent(orderId)}/review`, {
        method: "POST",
        body: { rating: input.rating, ...(input.comment ? { comment: input.comment } : {}) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.order(orderId) });
    },
  });
}

/* ── search ───────────────────────────────────────────────────────────────── */

export type SearchProduct = Product & {
  shopId: string;
  shop: Pick<Shop, "id" | "slug" | "name" | "nameNp" | "area" | "emoji" | "isOpen" | "minOrder"> & {
    category?: ShopCategory | null;
  };
  distanceMeters?: number | null;
};

export type SearchResult = {
  query: string;
  locationApplied: boolean;
  shops: Shop[];
  products: SearchProduct[];
};

/**
 * Search, debounced by the caller.
 *
 * `enabled` is gated on two characters because a one-letter query matches half
 * the catalogue and costs a full-text scan to say so. The debounce lives in the
 * screen rather than here, so the hook stays a plain read.
 */
export function useSearch(query: string, point?: { lat: number; lng: number } | null) {
  const { http } = useGopasal();
  const q = query.trim();
  const where = point ?? FALLBACK_POINT;

  return useQuery({
    queryKey: ["search", q, Number(where.lat.toFixed(3)), Number(where.lng.toFixed(3))] as const,
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: () =>
      http.request<SearchResult>(
        `/discovery/search?q=${encodeURIComponent(q)}&lat=${where.lat.toFixed(3)}&lng=${where.lng.toFixed(3)}`,
      ),
  });
}

/* ── saved ────────────────────────────────────────────────────────────────── */

export function useSavedShops() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["saved-shops"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: async () => {
      const result = await http.request<Paginated<Shop> | Shop[]>("/saved/shops");
      return Array.isArray(result) ? result : result.data;
    },
  });
}

export function useSavedProducts() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["saved-products"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: async () => {
      const result = await http.request<Paginated<SearchProduct> | SearchProduct[]>(
        "/saved/products",
      );
      return Array.isArray(result) ? result : result.data;
    },
  });
}

/* ── notifications ────────────────────────────────────────────────────────── */

export { notificationRows, type AppNotification } from "./notification-wire";
import { notificationRows } from "./notification-wire";

export function useNotifications(options?: { poll?: boolean }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["notifications"] as const,
    enabled: Boolean(user),
    staleTime: 20_000,
    refetchInterval: options?.poll ? 30_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => notificationRows(await http.request<unknown>("/notifications")),
  });
}

/** The badge number. Cheap, so it can be polled where the inbox is not open. */
export function useUnreadNotifications(options?: { poll?: boolean }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["notifications", "unread"] as const,
    enabled: Boolean(user),
    staleTime: 20_000,
    refetchInterval: options?.poll ? 60_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const result = await http.request<{ unread?: number } | number>(
        "/notifications/unread-count",
      );
      return typeof result === "number" ? result : (result.unread ?? 0);
    },
  });
}

export function useNotificationActions() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  const settle = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  return {
    markRead: useMutation({
      mutationFn: (id: string) =>
        http.request<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
      onSuccess: settle,
    }),
    markAllRead: useMutation({
      mutationFn: () => http.request<unknown>("/notifications/read-all", { method: "PATCH" }),
      onSuccess: settle,
    }),
  };
}

/* ── profile ──────────────────────────────────────────────────────────────── */

export function useUpdateProfile() {
  const { http, session } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; email?: string; locale?: string }) =>
      http.request<Session["user"]>("/users/me", { method: "PATCH", body: input }),
    onSuccess: async (updated) => {
      // The stored session carries the profile so the signed-in shell can paint
      // on the first frame; a name changed here has to land there too, or the
      // app greets you by your old name until the next sign-in.
      const current = session.get();
      if (current) await session.set({ ...current, user: updated });
      void qc.invalidateQueries();
    },
  });
}

/* ── support ──────────────────────────────────────────────────────────────── */

export type SupportTicket = {
  id: string;
  code: string;
  subject: string;
  status: string;
  category?: string | null;
  orderId?: string | null;
  createdAt: string;
  updatedAt?: string;
  messages?: { id: string; body: string; author?: string | null; createdAt: string }[];
};

export function useTickets() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["tickets"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: async () => {
      const result = await http.request<Paginated<SupportTicket> | SupportTicket[]>(
        "/support/tickets",
      );
      return Array.isArray(result) ? result : result.data;
    },
  });
}

export function useCreateTicket() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subject: string; message: string; orderId?: string }) =>
      http.request<SupportTicket>("/support/tickets", { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

/** One file on a ticket message. The bytes are fetched on demand, authenticated. */
export type TicketFile = { id: string; fileName: string; mimeType: string; sizeBytes: number };

export type TicketMessage = {
  id: string;
  body: string;
  /** True for GoPasal's side of the conversation. */
  isStaff: boolean;
  createdAt: string;
  author?: { name: string | null } | null;
  files?: TicketFile[];
};

export type SupportTicketDetail = Omit<SupportTicket, "messages"> & { messages: TicketMessage[] };

/**
 * One ticket, with the whole conversation.
 *
 * The ticket list only ever carried each ticket's first message, and there was
 * no screen behind a row — so a customer could open a ticket and never read
 * GoPasal's answer to it in the app.
 */
export function useTicket(ticketId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["tickets", ticketId ?? ""] as const,
    enabled: Boolean(user) && Boolean(ticketId),
    staleTime: 15_000,
    queryFn: () =>
      http.request<SupportTicketDetail>(`/support/tickets/${encodeURIComponent(ticketId!)}`),
  });
}

/** A picked photo or PDF. `{ uri, name, type }`, the shape RN's FormData takes. */
export type TicketAttachment = FilePart;

/**
 * Reply on a ticket, optionally with one photo or PDF.
 *
 * With a file it is `POST …/messages/with-file` as multipart, which the shared
 * JSON client does not speak — hence the direct `fetch`, with the same token
 * refresh the client does. The server sniffs the bytes (JPEG, PNG, WebP or PDF)
 * and caps a ticket at 20 files; both refusals arrive as sentences.
 */
export function useTicketReply(ticketId: string | null | undefined) {
  const { http, session } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; file?: TicketAttachment | null }) => {
      const path = `/support/tickets/${encodeURIComponent(ticketId!)}/messages`;
      if (!input.file) {
        return http.request<SupportTicketDetail>(path, {
          method: "POST",
          body: { body: input.body },
        });
      }
      const stored = session.get();
      if (stored && stored.accessExpiresAt - 30_000 <= Date.now()) await http.refreshSession();
      const token = session.get()?.accessToken;
      const form = new FormData();
      form.append("body", input.body);
      await appendFilePart(form, "file", input.file);
      let res: Response;
      try {
        res = await fetch(`${http.root()}${path}/with-file`, {
          method: "POST",
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: form,
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        throw new ApiError(0, "Couldn't send that file. Check the connection and try again.");
      }
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        const message =
          parsed && typeof parsed === "object" && "message" in parsed
            ? String((parsed as { message: unknown }).message)
            : `Upload failed (${res.status})`;
        throw new ApiError(res.status, message, parsed);
      }
      return parsed as SupportTicketDetail;
    },
    onSuccess: (ticket) => {
      if (ticket) qc.setQueryData(["tickets", ticketId ?? ""], ticket);
      void qc.invalidateQueries({ queryKey: ["tickets"], exact: true });
    },
  });
}

export function useCloseTicket(ticketId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      http.request<unknown>(`/support/tickets/${encodeURIComponent(ticketId!)}/close`, {
        method: "PATCH",
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

/* ── disputes ─────────────────────────────────────────────────────────────── */

export type Dispute = {
  id: string;
  orderId: string;
  reason: string;
  detail?: string | null;
  status: string;
  resolution?: string | null;
  createdAt: string;
  order?: { code: string; total: number; status: OrderStatus } | null;
};

/**
 * A dispute is not a support ticket.
 *
 * A ticket is a conversation; a dispute is a formal claim attached to one order
 * that finance can refund against, and the server will only take one per order
 * and not before the shop has had a chance to act. Keeping them separate in the
 * app matters because "where is my money" and "I have a question" get answered
 * by different people.
 */
export function useDisputes() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["disputes"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: () => http.request<Dispute[]>("/support/disputes"),
  });
}

export function useRaiseDispute() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...body }: { orderId: string; reason: string; detail?: string }) =>
      http.request<Dispute>(`/support/orders/${encodeURIComponent(orderId)}/dispute`, {
        method: "POST",
        body,
      }),
    onSuccess: (_result, { orderId }) => {
      void qc.invalidateQueries({ queryKey: ["disputes"] });
      void qc.invalidateQueries({ queryKey: qk.order(orderId) });
    },
  });
}

/* ── an unpaid order ──────────────────────────────────────────────────────── */

/**
 * Start a fresh gateway attempt.
 *
 * An eSewa or Khalti attempt can die in a hundred ways that have nothing to do
 * with the customer — a dropped redirect, a bank timeout — and the order is
 * still there, unpaid. Without this the only move is to place the whole order
 * again, which is how people end up with two.
 */
export function useRetryPayment() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      http.request<{ redirectUrl?: string | null }>(
        `/orders/${encodeURIComponent(orderId)}/payment/retry`,
        { method: "POST" },
      ),
    onSuccess: (_result, orderId) => {
      void qc.invalidateQueries({ queryKey: qk.order(orderId) });
    },
  });
}

/* ── the small print ──────────────────────────────────────────────────────── */

export type PolicySummary = {
  id: string;
  key: string;
  version: string;
  title: string;
  effectiveAt: string;
};

export type PolicyDocument = PolicySummary & { content: string };

/** The list is public, so this works signed out — a policy nobody can read before
 *  they sign up is not a policy. */
export function usePolicies() {
  const { http } = useGopasal();
  return useQuery({
    queryKey: ["policies"] as const,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => http.request<PolicySummary[]>("/policies"),
  });
}

export function usePolicy(key: string) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: ["policy", key] as const,
    enabled: Boolean(key),
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => http.request<PolicyDocument>(`/policies/${encodeURIComponent(key)}`),
  });
}

/* ── my reviews ───────────────────────────────────────────────────────────── */

export type MyReview = {
  id: string;
  orderId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  shop?: { name: string; slug: string } | null;
};

export function useMyReviews() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["my-reviews"] as const,
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: async () => {
      const result = await http.request<Paginated<MyReview> | MyReview[]>("/me/reviews");
      return Array.isArray(result) ? result : result.data;
    },
  });
}

/* ── the account itself ───────────────────────────────────────────────────── */

export type DeletionBlocker = { code: string; message: string; count: number };
export type DeletionEligibility = {
  eligible: boolean;
  blockers: DeletionBlocker[];
  retained: string[];
};

export function useDeletionEligibility(enabled = true) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["deletion-eligibility"] as const,
    enabled: enabled && Boolean(user),
    staleTime: 0,
    retry: false,
    queryFn: () => http.request<DeletionEligibility>("/users/me/deletion-eligibility"),
  });
}

/**
 * Closing the account, in the three steps the server actually requires.
 *
 * The code goes to the login number, the words "DELETE MY ACCOUNT" have to be
 * typed exactly, and the retention notice has to be acknowledged — none of
 * which the app may skip or pre-tick, because that is the difference between a
 * decision and an accident.
 */
export function useAccountDeletion() {
  const { http, session } = useGopasal();
  return {
    requestCode: useMutation({
      mutationFn: () =>
        http.request<{ sent: true; developmentCode?: string; cooldownSeconds?: number }>(
          "/users/me/deletion-code",
          { method: "POST" },
        ),
    }),
    confirm: useMutation({
      mutationFn: (input: { code: string; reason?: string }) =>
        http.request<unknown>("/users/me", {
          method: "DELETE",
          body: {
            code: input.code,
            confirmation: "DELETE MY ACCOUNT",
            acknowledgeRetention: true,
            reason: input.reason,
          },
        }),
      onSuccess: async () => {
        await session.clear();
      },
    }),
  };
}

/** Everything the platform holds about you, as JSON, fetched with your token. */
export function useDataExport() {
  const { http } = useGopasal();
  return useMutation({
    mutationFn: () => http.request<Record<string, unknown>>("/users/me/data-export"),
  });
}

/* ── group orders ─────────────────────────────────────────────────────────── */

export type GroupParticipant = {
  id: string;
  userId: string;
  joinedAt: string;
  user: { name: string | null };
  items: { productId: string; variantId?: string | null; qty: number }[];
};

export type GroupOrder = {
  id: string;
  code: string;
  hostId: string;
  shopId: string;
  status: "OPEN" | "LOCKED" | "PLACED" | "CANCELLED" | string;
  expiresAt: string | null;
  createdAt: string;
  participants: GroupParticipant[];
  shop: { id: string; name: string; slug: string; minOrder: number };
  order: { id: string; code: string; status: OrderStatus } | null;
};

export const groupKeys = {
  mine: () => ["group-orders"] as const,
  one: (id: string) => ["group-order", id] as const,
};

export function useMyGroupOrders() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: groupKeys.mine(),
    enabled: Boolean(user),
    staleTime: STALE.mine,
    queryFn: async () => {
      const result = await http.request<Paginated<GroupOrder> | GroupOrder[]>("/group-orders/mine");
      return Array.isArray(result) ? result : result.data;
    },
  });
}

/**
 * One group, polled while somebody is looking at it.
 *
 * A group order is the one screen in this app where other people change what
 * you are looking at while you look at it, so it polls — but only on focus and
 * only while the group is still open. A placed or cancelled group never changes
 * again and polling it is pure waste.
 */
export function useGroupOrder(id: string, options?: { poll?: boolean }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: groupKeys.one(id),
    enabled: Boolean(id) && Boolean(user),
    staleTime: 3_000,
    refetchInterval: options?.poll ? 5_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () => http.request<GroupOrder>(`/group-orders/${encodeURIComponent(id)}`),
  });
}

export function useGroupOrderActions(groupOrderId?: string) {
  const { http } = useGopasal();
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: groupKeys.mine() });
    if (groupOrderId) void qc.invalidateQueries({ queryKey: groupKeys.one(groupOrderId) });
  };
  const at = (suffix: string) => `/group-orders/${encodeURIComponent(groupOrderId ?? "")}${suffix}`;

  return {
    start: useMutation({
      mutationFn: (shopId: string) =>
        http.request<GroupOrder>("/group-orders", { method: "POST", body: { shopId } }),
      onSuccess: settle,
    }),
    join: useMutation({
      mutationFn: (code: string) =>
        http.request<GroupOrder>("/group-orders/join", {
          method: "POST",
          body: { code: code.trim().toUpperCase() },
        }),
      onSuccess: settle,
    }),
    setItems: useMutation({
      mutationFn: (items: { productId: string; variantId?: string | null; qty: number }[]) =>
        http.request<GroupOrder>(at("/items"), { method: "POST", body: { items } }),
      onSuccess: settle,
    }),
    leave: useMutation({
      mutationFn: () => http.request<unknown>(at("/leave"), { method: "POST" }),
      onSuccess: settle,
    }),
    lock: useMutation({
      mutationFn: () => http.request<GroupOrder>(at("/lock"), { method: "POST" }),
      onSuccess: settle,
    }),
    cancel: useMutation({
      mutationFn: () => http.request<GroupOrder>(at("/cancel"), { method: "POST" }),
      onSuccess: settle,
    }),
    place: useMutation({
      mutationFn: (input: CheckoutInput) =>
        http.request<PlacedOrder>(at("/place"), {
          method: "POST",
          // Combined or not, an order must not be placeable twice.
          idempotencyKey: newClientMessageId(),
          body: {
            addressId: input.addressId,
            paymentMethod: input.paymentMethod,
            useGoCoins: Boolean(input.useGoCoins),
            ...(input.couponCode ? { couponCode: input.couponCode } : {}),
            ...(input.note ? { note: input.note } : {}),
          },
        }),
      onSuccess: () => {
        settle();
        void qc.invalidateQueries({ queryKey: qk.orders() });
      },
    }),
  };
}

/** The host's combined quote. Same authority rule as a solo checkout. */
export function useGroupQuote(groupOrderId: string, addressId: string | null, enabled: boolean) {
  const { http } = useGopasal();
  return useQuery({
    queryKey: ["group-quote", groupOrderId, addressId] as const,
    enabled: Boolean(groupOrderId) && Boolean(addressId) && enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      http.request<CheckoutQuote>(`/group-orders/${encodeURIComponent(groupOrderId)}/quote`, {
        method: "POST",
        body: { addressId },
      }),
  });
}

/* ── support assistant ────────────────────────────────────────────────────── */

export type AssistantMessage = {
  id: string;
  role: "CUSTOMER" | "ASSISTANT" | string;
  body: string;
  createdAt: string;
  sources?: { id: string; title: string }[];
  /** Client-only, while the answer is being written. */
  pending?: boolean;
};

export type AssistantSession = {
  id: string;
  messages: AssistantMessage[];
  knowledgeVersion?: string;
  ticket?: { id: string; code: string } | null;
};

/** The conversation in progress, if there is one. */
export function useAssistantSession() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: ["assistant"] as const,
    enabled: Boolean(user),
    staleTime: 10_000,
    queryFn: () => http.request<AssistantSession | null>("/support/assistant/sessions/current"),
  });
}

/**
 * Asking the assistant.
 *
 * `clientMessageId` again: the endpoint is keyed on it, so a question asked on
 * a flaky connection is answered once rather than three times. The optimistic
 * bubble is marked pending because an assistant answer takes a few seconds and
 * a chat with no acknowledgement of the question feels broken.
 */
export function useAskAssistant() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ message, sessionId }: { message: string; sessionId?: string }) =>
      http.request<AssistantSession>("/support/assistant/messages", {
        method: "POST",
        // Answers can be slow; the default 15s timeout cuts them off.
        timeoutMs: 45_000,
        body: {
          message,
          clientMessageId: newClientMessageId(),
          ...(sessionId ? { sessionId } : {}),
        },
      }),
    onMutate: async ({ message }) => {
      await qc.cancelQueries({ queryKey: ["assistant"] });
      qc.setQueryData<AssistantSession | null>(["assistant"], (current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: `pending-${Date.now()}`,
                  role: "CUSTOMER",
                  body: message,
                  createdAt: new Date().toISOString(),
                  pending: true,
                },
              ],
            }
          : current,
      );
    },
    onSuccess: (session) => {
      qc.setQueryData(["assistant"], session);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["assistant"] });
    },
  });
}

/** Hand the whole transcript to a human. */
export function useEscalateAssistant() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      http.request<SupportTicket>(
        `/support/assistant/sessions/${encodeURIComponent(sessionId)}/escalate`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assistant"] });
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
