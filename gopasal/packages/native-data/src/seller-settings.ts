/**
 * The shop's own record: what it is called, where it is, when it opens, how far it
 * delivers, and what it will not deliver for less than.
 *
 * `PATCH /seller/shops/:shopId` (`settings.manage`) is the whole of it, plus the
 * manage read `GET /seller/shops/:shopId` (`dashboard.view`) and the phone location
 * capture. `./seller` reaches the same PATCH with two keys — `isOpen` and
 * `minOrder`, the two decisions made at the moment they become true — and says the
 * rest belongs to a console because it is typed once, carefully, sitting down. That
 * was right about *care* and wrong about *place*: the things a shop needs to change
 * are its hours when it starts closing early for winter, its phone number when the
 * old handset dies, and its pin — and a pin can only honestly be set by a device
 * standing in the shop, which is this one.
 *
 * Reached as `@gopasal/native-data/seller-settings`, and deliberately not
 * re-exported from `./index`.
 *
 * ## Three things about the PATCH that decide how a form is built
 *
 *  1. **It is a true partial update.** `ShopsService.update` hands the validated
 *     body straight to `prisma.shop.update` as `data`, so an omitted key leaves its
 *     column untouched. Send a diff, never a snapshot — {@link shopSettingsDiff}
 *     builds one, and the reasons are in its comment.
 *  2. **`null` is not a value.** Every field is `@OptionalField()`, so an explicit
 *     `null` is a 400 naming the field rather than "clear this". A nullable text
 *     column is cleared with `""`; `categoryId` can be changed and not emptied.
 *  3. **The response is a bare `Shop` row** — `prisma.shop.update` with no
 *     `include`, so no `myRole`, no `_count`, no `storefront`, no `category`. It
 *     must never be merged into the shop list, or the switcher loses the role and
 *     the dashboard loses its storefront banner. The list is refetched.
 *
 * ## Writes go straight to `http`
 *
 * `./seller`'s reasoning. A settings save queued offline and replayed ten minutes
 * later overwrites whatever a colleague did in between, on a row where every column
 * is shop-wide and customer-visible, and no seller route reads an
 * `Idempotency-Key`. The seller is standing in the shop looking at the screen; a
 * visible failure they can retry is the better outcome.
 *
 * ## What this module invalidates elsewhere
 *
 * A save invalidates `qk.shops()` — `seller-wire.ts`'s key, shared rather than
 * copied, because it is what the shop switcher, the open/closed toggle and the
 * storefront banner all read. It also invalidates this module's own
 * `settingsQk.shop(shopId)` detail. Changing the delivery radius additionally
 * invalidates `./seller-delivery`'s zone list: the two are one answer — a zone is
 * consulted **only** for destinations outside the radius — so widening the radius
 * can make a zone irrelevant and narrowing it can make one load-bearing, and a map
 * screen holding the old radius would draw the wrong picture.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ShopLifecycle } from "@gopasal/api-client/types";
import { STALE, useGopasal } from "./GopasalProvider";
import type { ShopRow } from "./seller";
import { qk } from "./seller-wire";
import { deliveryQk } from "./seller-delivery-wire";
import { settingsQk } from "./seller-settings-wire";

/**
 * The pure half is re-exported wholesale so a settings screen has one import, while
 * `./seller-settings-wire` stays importable on its own — which is what lets the
 * PATCH diff and the capture freshness window be tested without a phone.
 */
export {
  CAPTURE_ACCURACY_MAX_M,
  CAPTURE_ACCURACY_MIN_M,
  CAPTURE_MAX_AGE_MS,
  CAPTURE_MAX_SKEW_AHEAD_MS,
  CAPTURE_TTL_MS,
  SHOP_LIMITS,
  captureIssue,
  isEmptyPatch,
  settingsQk,
  shopSettingsDiff,
  shopSettingsIssues,
} from "./seller-settings-wire";
export type { CaptureIssue, ShopSettingIssue } from "./seller-settings-wire";

/** Re-exported so a settings screen has one import surface for the row it renders. */
export type { ShopRow, SellerShop } from "./seller";

/* ── the manage read ──────────────────────────────────────────────────────── */

/**
 * `GET /seller/shops/:shopId` — `ShopsService.getForManage`.
 *
 * Not the same shape as a row of `GET /seller/shops`, which is why it has its own
 * type and its own key. It carries the resolved `category` object and a third count
 * (`memberships`) that the list does not, and it carries **no `myRole`**, because
 * the route is addressed by shop rather than derived from the caller's memberships
 * — so a screen that needs to know whether this seller may edit still reads the
 * list, or `/auth/me`.
 *
 * `storefront` is the answer to the question a seller actually asks — "why can
 * nobody see my shop?" — and is worth rendering verbatim rather than inferred from
 * `status` and `isOpen`, which between them cannot express "approved, open, and
 * stocking nothing deliverable".
 *
 * `dashboard.view`, a *different* permission from the `settings.manage` the save
 * needs. A teammate can therefore read this screen and not save it, which is the
 * arrangement the console assumes too.
 */
export type ShopDetail = ShopRow & {
  category: { id: string; slug: string; en: string; np: string; icon: string; hue: string; sortOrder: number } | null;
  _count: { products: number; orders: number; memberships: number };
  storefront: {
    visible: boolean;
    blockers: Array<"APPROVAL" | "VERIFIED_LOCATION" | "DELIVERABLE_PRODUCT">;
    deliverableProductCount: number;
  };
};

/** `ShopLifecycle` from the shared wire types, re-exported for a status badge. */
export type { ShopLifecycle };

/**
 * The shop as the settings screen reads it.
 *
 * `STALE.mine` rather than `SELLER_STALE.counter`: this is the seller's own record,
 * and it changes when somebody edits it rather than in the course of a shift. The
 * one field that does move on its own — `storefront.blockers` — is invalidated
 * explicitly by every write that can affect it, in this module and in
 * `./seller-catalog`, which is more precise than a short `staleTime` and costs
 * nothing when nothing happened.
 *
 * `useMyShops` in `./seller` is still the right read for a *list* and for
 * `myRole`. This one is for the screen that edits one shop in full.
 */
export function useShopDetail(shopId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: settingsQk.shop(shopId ?? ""),
    staleTime: STALE.mine,
    enabled: Boolean(shopId) && Boolean(user),
    queryFn: () => http.request<ShopDetail>(`/seller/shops/${encodeURIComponent(shopId!)}`),
  });
}

/* ── the settings patch ───────────────────────────────────────────────────── */

/**
 * `UpdateShopDto` — **every field it accepts, and nothing else**.
 *
 * Thirteen keys. `forbidNonWhitelisted` means a fourteenth is a 400 naming it
 * rather than a silently ignored field, so writing this type out is what stops such
 * a request from being built by accident. Each omission below is an absence in the
 * API, not in this module:
 *
 *  - **`lat`, `lng`, `locationAccuracyM`, `locationCapturedAt` and
 *    `locationCaptureMethod`.** Coordinates are intentionally absent from the DTO.
 *    The time-limited phone capture is the only seller path that can replace a shop
 *    pin, which is what makes a pin mean "somebody stood there" rather than "somebody
 *    typed two numbers". {@link useShopLocationCapture} is that path.
 *  - **`logoImage` and `coverImage`.** Both columns exist on `Shop` as `String?`,
 *    and **no request body in any scope accepts them** — so there is nothing to
 *    wire rather than something not yet wired. A URL a seller typed in is exactly
 *    the client-supplied storage path this platform refuses, and these two are
 *    rendered as the shop's branding on the storefront. Filling them properly means
 *    the shape the product photos got: a multipart route that sniffs the bytes and
 *    mints a `public/` key server-side.
 *  - **`codEnabled` and `onlinePaymentEnabled`.** Same: the columns exist, no body
 *    accepts them. See {@link shopPaymentMethods}.
 *  - **`slug`, `status`, `verified`, `statusReason`, `ownerId`, `approvedAt`,
 *    `ratingAvg`, `ratingCount`.** Platform-owned. `status` and `statusReason` are
 *    written by an admin review; `verified` and `approvedAt` by the approval; the
 *    ratings by customer reviews.
 *
 * `null` is a 400 on every field here, so the `| null` unions that `ProductPatch`
 * carries are deliberately absent. The two bodies genuinely disagree, and a
 * product's category can be emptied while a shop's cannot.
 */
export type ShopSettingsPatch = {
  /** 2–120 characters. `""` is a 400, which it was not before the API was hardened. */
  name?: string;
  /** ≤ 120. `""` clears it. */
  nameNp?: string;
  /** ≤ 1000. `""` clears it. */
  description?: string;
  /** ≤ 60. A real category id — it can be changed but never emptied. */
  categoryId?: string;
  /** ≤ 20. The number customers are given, not the account's login number. */
  phone?: string;
  /** ≤ 160. */
  area?: string;
  /** ≤ 300. */
  fullAddress?: string;
  /** 0.5–20 km. A real number; `"3"` is a 400. See the note in `useShopSettings`. */
  deliveryRadiusKm?: number;
  /** ≤ 16. */
  emoji?: string;
  /** ≤ 120. **Free text, not a schedule** — `"7am – 9pm"`. Nothing parses it. */
  hours?: string;
  /** The shutter. Also reachable from `./seller`'s `useShopSettings`, optimistically. */
  isOpen?: boolean;
  /** Whole rupees, ≥ 0. A real integer; `"200"` is a 400. */
  minOrder?: number;
  /** The shop runs without riders — the owner delivers. See the note below. */
  soloMode?: boolean;
};

/**
 * Save shop settings.
 *
 * `settings.manage` **on this shop**, resolved by `PermissionsGuard` from the
 * `:shopId` in the path — there is no body field or header that could redirect it,
 * and an ambient "permission somewhere" grant is not enough. The shop's lifecycle
 * has a say too, and `/auth/me` already reports it: `settings.manage` is allowed on
 * ACTIVE, PENDING and REJECTED shops and refused on a SUSPENDED one, and the
 * effective-permission list reflects that, so a screen gated on the reported
 * permission turns read-only for a suspended shop without knowing the rule.
 *
 * Not optimistic, with one exception that is not this hook's. `./seller`'s
 * `useShopSettings` patches `isOpen` optimistically because a shutter toggle that
 * does not move under a thumb gets pressed twice — and it should keep being used
 * for that. This hook is the form's save: a round trip is expected, the server
 * trims and clamps, and the fields are re-seeded from the row it answered with so
 * that what is on screen afterwards is what the shop actually carries.
 *
 * Two field notes that are easy to get wrong:
 *
 *  - **`deliveryRadiusKm` is a `Float`, not an integer**, and `@IsNumber()` runs
 *    without implicit conversion. `3.5` is fine; `"3.5"` is a 400. A slider gives a
 *    number and a text input does not.
 *  - **`soloMode` is a real column with no behaviour attached on this surface.** It
 *    records that the shop delivers its own orders rather than using riders. A
 *    screen may offer it; it must not imply that turning it on changes how orders
 *    are dispatched, because the order machine still requires a rider before
 *    `dispatch` either way.
 */
export function useShopSettingsForm(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (patch: ShopSettingsPatch) =>
      http.request<ShopRow>(`/seller/shops/${encodeURIComponent(shopId!)}`, {
        method: "PATCH",
        body: patch,
      }),

    onSuccess: (_row, patch) => {
      // Refetched rather than merged: the response is a bare `Shop`, and merging it
      // into the list would blank `myRole`, `_count` and `storefront` on the shop
      // the switcher and the dashboard are rendering.
      void qc.invalidateQueries({ queryKey: qk.shops() });
      void qc.invalidateQueries({ queryKey: settingsQk.shop(shopId ?? "") });

      // The radius and the zones are one answer, not two: `serviceability` consults
      // a zone **only** for a destination outside the radius. Moving the radius
      // therefore changes what every zone is for, so a zone screen holding the old
      // number would draw a coverage map that is wrong in both directions.
      if (patch.deliveryRadiusKm !== undefined) {
        void qc.invalidateQueries({ queryKey: deliveryQk.zones(shopId ?? "") });
      }
    },
  });
}

/* ── payment methods, which are read-only ─────────────────────────────────── */

/**
 * Which payment methods this shop offers — a **read**, because nothing on any
 * surface can write them.
 *
 * `Shop.codEnabled` and `Shop.onlinePaymentEnabled` exist as columns, are returned
 * on every shop read, and appear in **no request body in any scope** — not the
 * seller DTO, not the admin one, not onboarding. Which payment methods a shop may
 * offer is a platform decision that travels with approval, and turning card
 * payments on for a shop with no settlement path behind it would be worse than not
 * offering the switch at all.
 *
 * So this is deliberately a projection of the row rather than a mutation, and a
 * screen should render it as a statement with a line about who changes it. The
 * console does the same thing for the same reason. A `<Switch>` here would 400 on
 * the field name.
 *
 * `methods` is the list a customer will actually be offered at checkout for this
 * shop, in the order the payment providers are named in `PaymentMethod`.
 */
export function shopPaymentMethods(shop: {
  codEnabled: boolean;
  onlinePaymentEnabled: boolean;
}): { codEnabled: boolean; onlinePaymentEnabled: boolean; methods: Array<"COD" | "ESEWA" | "KHALTI">; editable: false } {
  const methods: Array<"COD" | "ESEWA" | "KHALTI"> = [];
  if (shop.codEnabled) methods.push("COD");
  if (shop.onlinePaymentEnabled) methods.push("ESEWA", "KHALTI");
  return {
    codEnabled: shop.codEnabled,
    onlinePaymentEnabled: shop.onlinePaymentEnabled,
    methods,
    // A literal, so a screen cannot render a control behind a runtime check that
    // might one day be true. If the API ever accepts these fields, this type
    // changes and every call site is told.
    editable: false,
  };
}

/* ── the shop pin ─────────────────────────────────────────────────────────── */

/**
 * `LOCATION_CAPTURE_MODES`.
 *
 * `DIRECT` means the phone that asked for the link is the phone that will take the
 * reading — which on this surface is the ordinary case and the reason the capture
 * flow belongs here at all. `HANDOFF` means the link is given to somebody else's
 * phone (a QR on a laptop screen, a message to a colleague standing in the shop),
 * which is what the console needs and what the token exists for.
 */
export type LocationCaptureMode = "DIRECT" | "HANDOFF";

export type LocationCaptureStatus = "WAITING" | "CAPTURED" | "EXPIRED";

/**
 * A capture session as the API reports it.
 *
 * `token` is present **only on the response to creating one** and is never returned
 * again. It is the bearer credential for the public submit route, hashed on the
 * server and stored in Redis with a ten-minute TTL, and creating a new session for
 * the same shop revokes the previous one. It must not be logged, persisted, or put
 * in a query the cache writes to disk — which is why {@link useShopLocationCapture}
 * keeps it in a ref rather than in React Query state.
 */
export type LocationCaptureSession = {
  captureId: string;
  status: LocationCaptureStatus;
  mode: LocationCaptureMode;
  expiresAt: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  capturedAt: string | null;
};

/** A reading from the device, in the shape the submit route takes. */
export type CapturedPosition = {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres. Must be 1–100 or the API refuses it. */
  accuracyM: number;
  /** The reading's own timestamp, not the moment of sending. */
  capturedAtMs: number;
};

/**
 * Replace the shop's pin with a reading taken on this phone.
 *
 * This is the only seller path to `Shop.lat`/`lng`, by design: `UpdateShopDto` has
 * no coordinate fields, so a pin cannot be typed in. What it can be is *measured*,
 * by a device standing in the shop — and the whole point of the mechanism is that
 * the measurement carries its own provenance: `locationAccuracyM`,
 * `locationCapturedAt` and `locationCaptureMethod` are written alongside the
 * coordinates, so `VERIFIED_LOCATION` means something.
 *
 * ## Why a phone takes two steps to do a one-step thing
 *
 * `create` mints a short-lived bearer token; `submit` spends it on the public
 * route. On a laptop those are two devices and the token is the bridge. Here they
 * are the same device, and the indirection looks redundant — but it is the *only*
 * route that writes a shop pin, so this is the mechanism, and the phone's advantage
 * is simply that it can do both halves itself, in `DIRECT` mode, in one tap.
 *
 * The constraints, all of them the server's:
 *
 *  - **The link lives ten minutes** and creating a new one for this shop revokes
 *    the previous one. `expiresAt` says when.
 *  - **The reading must be fresh** — no older than two minutes, and no more than
 *    thirty seconds ahead of the *server's* clock, which is 409 "That GPS reading is
 *    not fresh." A phone with a wrong clock cannot capture at all, however good its
 *    GPS.
 *  - **Accuracy must be 1–100 m.** Worse is refused outright rather than recorded
 *    approximately, because a pin with a 500 m error covers streets the shop does
 *    not deliver to.
 *  - **Authorisation is re-checked at submit time**, not frozen at create time: the
 *    service calls `rbac.assert(requester, 'settings.manage', shopId)` before
 *    writing, so a seller who loses the permission while the link is open cannot
 *    spend it.
 *  - **The submit is a one-shot claim** across API replicas. A second submit on a
 *    consumed token answers `{ status: "CAPTURED" }` rather than writing again.
 *
 * {@link captureIssue} checks the first three locally, which matters here more than
 * anywhere else in this package: the seller is standing in a doorway waiting for a
 * fix, and "step outside and try again" is advice a round trip cannot give faster
 * than the phone can.
 *
 * `submit` goes out **anonymous**: `POST /public/location-captures/:token` is a
 * `@Public()` route and the token is the credential. Sending the seller's bearer
 * alongside it would be harmless and misleading.
 */
export function useShopLocationCapture(shopId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  // Held in a ref rather than in query state: the cache is persisted to
  // AsyncStorage, and a bearer token for a route that rewrites the shop's pin does
  // not belong in a plain file in the app sandbox. It also dies with the screen,
  // which is the right lifetime for something that expires in ten minutes.
  const token = React.useRef<string | null>(null);

  const create = useMutation({
    mutationFn: async (mode: LocationCaptureMode = "DIRECT") => {
      const session = await http.request<LocationCaptureSession & { token: string }>(
        `/seller/shops/${encodeURIComponent(shopId!)}/location-captures`,
        { method: "POST", body: { mode } },
      );
      token.current = session.token;
      return session;
    },
    // `captureId` is deliberately not kept here: it is the handle
    // `useLocationCaptureStatus` needs, and holding a second copy in this hook
    // would let a screen poll an id it had not been given — which is how the
    // status of an old, revoked link ends up on screen beside a new one.
  });

  const submit = useMutation({
    mutationFn: async (position: CapturedPosition) => {
      const current = token.current;
      if (!current) throw new Error("Start a location capture before submitting a reading");
      const session = await http.request<LocationCaptureSession | { status: "CAPTURED" }>(
        `/public/location-captures/${encodeURIComponent(current)}`,
        {
          method: "POST",
          anonymous: true,
          body: {
            lat: position.lat,
            lng: position.lng,
            accuracyM: position.accuracyM,
            capturedAt: new Date(position.capturedAtMs).toISOString(),
          },
        },
      );
      // One-shot: the token is spent whether the write happened here or on the
      // replica that got there first. Clearing it stops a second tap from sending
      // a request whose only possible answer is the receipt.
      token.current = null;
      return session;
    },
    onSuccess: () => {
      // The pin, its accuracy, its timestamp and its method have all changed on the
      // shop row — and with them `storefront.blockers`, since `VERIFIED_LOCATION`
      // is exactly this. Both shop reads have to come back.
      void qc.invalidateQueries({ queryKey: qk.shops() });
      void qc.invalidateQueries({ queryKey: settingsQk.shop(shopId ?? "") });
      // And the zones, because every zone is measured against the pin: moving the
      // shop moves the radius that decides whether a zone is consulted at all.
      void qc.invalidateQueries({ queryKey: deliveryQk.zones(shopId ?? "") });
    },
  });

  return {
    create,
    submit,
    /**
     * The link to hand to another device, in `HANDOFF` mode.
     *
     * Null in `DIRECT` mode after a submit, and null before a capture is created.
     * Read it once and do not store it: it is a bearer credential for rewriting
     * this shop's pin, and it expires in ten minutes.
     */
    handoffToken: () => token.current,
  };
}

/**
 * Wait for another device to submit a capture. For `HANDOFF` only.
 *
 * A separate hook rather than something `useShopLocationCapture` returns, because a
 * hook returned from a hook is a hook called inside a callback the moment a screen
 * uses it conditionally — which is the rule React actually enforces at runtime, not
 * a lint preference. So the `captureId` travels through the screen's own state: it
 * comes back on `create`'s response, the screen holds it, and passes it here.
 *
 * Pointless in `DIRECT` mode, where this phone took the reading and `submit`'s own
 * response is the answer — so `poll` is the screen's to pass, exactly as it is for
 * every other polling read in this package. Five seconds is the interval somebody
 * walking to the shop door is waiting at, and `refetchIntervalInBackground` stays
 * false so a locked phone is not polling a ten-minute link.
 *
 * `{ status: "EXPIRED" }` is the answer for a link whose Redis entry is gone —
 * either the ten minutes ran out or a newer link for this shop revoked it. It is a
 * different answer from `WAITING`, and a screen must stop waiting on it.
 *
 * `staleTime: 0` because the whole question is "has it happened yet", and a cached
 * "not yet" is worthless.
 */
export function useLocationCaptureStatus(
  shopId: string | null | undefined,
  captureId: string | null | undefined,
  options?: { poll?: boolean },
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: settingsQk.locationCapture(shopId ?? "", captureId ?? ""),
    enabled: Boolean(shopId) && Boolean(captureId) && Boolean(user),
    staleTime: 0,
    refetchInterval: options?.poll ? 5_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () =>
      http.request<LocationCaptureSession | { status: "EXPIRED" }>(
        `/seller/shops/${encodeURIComponent(shopId!)}/location-captures/${encodeURIComponent(captureId!)}`,
      ),
  });
}

/* ── what a seller cannot change, and where it lives instead ───────────────── */

/**
 * The payout destination is **not** editable here, and not anywhere on an approved
 * shop.
 *
 * Worth stating plainly because a settings screen is exactly where a seller looks
 * for it, and because the console appears to contradict this. Where the money goes
 * lives on the `ShopApplication`, not on the `Shop`: `payoutMethod`, `bankName`,
 * `bankBranch`, `bankAccountNo`, `bankAccountName` and `walletNumber` are all
 * `ApplicationFieldsDto` fields, writable through
 * `PATCH /seller/onboarding/applications/:id` — and only while the application is
 * in an editable status. Once GoPasal approves it and a `Shop` row exists, **no
 * route on any surface lets a seller change them.** `ShopsService.update` cannot
 * (they are not on the shop), and the admin surface reads them for review rather
 * than editing them.
 *
 * What a seller *can* see is the masked destination on a settlement:
 * `FinanceService` derives `payoutDestinationMasked` and `payoutMethod` from the
 * application row and attaches them to each `Settlement`, which `./seller`'s
 * `useShopFinance` returns. So the honest screen shows the masked account and says
 * that changing it means contacting GoPasal — not a disabled input, which implies a
 * permission somebody could be granted.
 *
 * The other absences, for the same reason:
 *
 *  - **The shop's logo and cover image.** Columns with no writer anywhere. A shop
 *    branding screen needs a multipart route that mints its own `public/` key, the
 *    shape the product photos got; until that exists there is nothing to call.
 *  - **Payment methods.** See {@link shopPaymentMethods}.
 *  - **The slug.** `Shop.slug` is `@unique` and is minted at approval from the
 *    shop's name. Renaming the shop does not move the storefront URL, which is
 *    worth telling a seller who has just renamed it.
 *  - **Staff, roles and invitations.** Real routes, on other controllers
 *    (`invites.shop.controller.ts`, the RBAC module), and a different module's job.
 */
