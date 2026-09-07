/**
 * Wire types the GoPasal API serialises the same way for every browser surface.
 *
 * The bar for living here is that *both* consoles read the identical shape from
 * the identical endpoint. Auth clears it: there is one `SafeUser`, one token
 * pair, one `GET /auth/me`. The onboarding *enums* clear it too, because they are
 * copied from `apps/api/prisma/schema.prisma` and a status is a status on either
 * side of the review.
 *
 * What deliberately does **not** live here is either console's view of an
 * application. The applicant's `toApplicantView` and the reviewer's
 * `toReviewerView` are different payloads from different routes — the reviewer's
 * has no `canEdit`, nests owner papers under `kyc` and bank details under
 * `payout`, masks the applicant's phone and carries an internal note. Merging
 * them into one optimistic type would compile and then be wrong at runtime, so
 * each app keeps its own in `lib/api/types.ts`.
 *
 * Source of truth: `apps/api/src/auth/*`, `apps/api/src/common/dto/pagination.dto.ts`
 * and `apps/api/prisma/schema.prisma`.
 */

/* ── envelopes ────────────────────────────────────────────────────────────── */

/**
 * `Paginated<T>` — every list endpoint answers in this shape.
 *
 * `meta` carries the page count under **two** names because the API does:
 * `paginate()` in `apps/api/src/common/dto/pagination.dto.ts` emits
 * `{ totalPages, pages }` with the same number in both. `pages` is what shipped
 * first and what the admin approvals queue reads; `totalPages` is the canonical
 * name and what new callers should read. Declaring only one of them here left this
 * type describing less than the wire actually sends, which is how a correct read of
 * `meta.totalPages` came to be a compile error.
 */
export type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    /** Canonical. Prefer this. */
    totalPages: number;
    /** The same number under its original name; kept because callers read it. */
    pages: number;
  };
};

/* ── auth ─────────────────────────────────────────────────────────────────── */

/**
 * Which console a sign-in came from. Mirrors `SURFACES` in
 * `apps/api/src/auth/dto/auth.dto.ts`, which is enforced with `@IsIn` — sending
 * anything else is a 400, so the union is worth having.
 */
export const AUTH_SURFACES = ["customer", "seller", "admin", "rider"] as const;
export type AuthSurface = (typeof AUTH_SURFACES)[number];

/** The only user shape the API ever returns (`SafeUser`, 7 keys). */
export type ApiUser = {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  locale: string;
  isPlatformStaff: boolean;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds (900 by default). */
  expiresIn: number;
};

export type RequestOtpResult = {
  sent: true;
  cooldownSeconds: number;
  expiresInSeconds: number;
  /**
   * False for `SMS_PROVIDER=log`, i.e. in local development the code is only
   * printed in the API log. The console surfaces that instead of pretending a
   * text message is on its way.
   */
  delivered: boolean;
};

/**
 * `POST /auth/otp/verify` nests its tokens under `tokens` while
 * `POST /auth/refresh` returns the pair flat. The server's naming is kept, and
 * the two stay separate types rather than one optimistic union.
 */
export type VerifyOtpResult = {
  user: ApiUser;
  tokens: TokenPair;
  isNewUser: boolean;
};

export type ShopLifecycle = "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export type ShopAccess = {
  shopId: string;
  owner: boolean;
  status: ShopLifecycle;
  restricted: boolean;
  /** Absent unless `restricted` is true. */
  restrictionReason?: string;
  permissions: string[];
};

/**
 * `GET /auth/me`. `access.platform` and each `access.shops[].permissions` are
 * resolved lists — already expanded to every key for a super admin — and they
 * are the only thing a console may use to decide what to offer.
 */
export type MeResult = {
  user: ApiUser;
  memberships: {
    shops: { shopId: string; role: { name: string } }[];
    platform: { role: { name: string } } | null;
  };
  access: {
    superAdmin: boolean;
    platform: string[];
    shops: ShopAccess[];
  };
};

/* ── onboarding enums (prisma/schema.prisma) ──────────────────────────────── */

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PAYOUT_METHODS = ["BANK", "ESEWA", "KHALTI"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const DOCUMENT_KINDS = [
  "CITIZENSHIP_FRONT",
  "CITIZENSHIP_BACK",
  "PAN_CERTIFICATE",
  "VAT_CERTIFICATE",
  "BUSINESS_LICENCE",
  "SHOP_PHOTO",
  "OWNER_PHOTO",
  "BANK_PROOF",
  "OTHER",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The longest `?q=` any list endpoint accepts, mirroring `SEARCH_MAX_LENGTH` in
 * `apps/api/src/common/dto/pagination.dto.ts`.
 *
 * It lives here so a search box can carry the server's own ceiling rather than a
 * number typed next to it. A client cap that is looser than the server's turns a
 * long paste into a 400 the seller cannot read; one that is tighter silently forbids
 * something the API would have answered. Both are the UI disagreeing with the API
 * about what is possible, which is the thing this contract exists to prevent.
 */
export const SEARCH_MAX_LENGTH = 120;

export type DocumentReviewState = "PENDING" | "ACCEPTED" | "REJECTED";

/**
 * `DocumentView` — exactly the 8 keys the API serialises, and the one onboarding
 * *view* that is byte-identical on both sides of the review.
 *
 * `fileName`, `mimeType` and `sizeBytes` are nullable because the columns are:
 * a row can exist before its object metadata is known. Anything rendering them
 * has to say so rather than print "undefined". There is no URL and no storage
 * key by design — bytes come from the authenticated download route, by id.
 */
export type ApplicationDocument = {
  id: string;
  kind: DocumentKind;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  review: DocumentReviewState;
  /** Why a reviewer turned it down. Written to be read by the applicant. */
  reviewNote: string | null;
  uploadedAt: string;
};

/**
 * The category as it is *nested inside* an application — four keys, no icon, no
 * hue, no sort order. Both `toApplicantView` and `toReviewerView` embed exactly
 * this, so it is shared; the fuller public `Category` from `GET /categories` is
 * a different payload and stays where it is used.
 */
export type ApplicationCategory = {
  id: string;
  slug: string;
  en: string;
  np: string;
};
