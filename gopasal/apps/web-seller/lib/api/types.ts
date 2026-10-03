/**
 * Wire types for the GoPasal API, as the seller console sees them.
 *
 * Anything the API serialises the same way for every browser surface — the auth
 * payloads, the onboarding enums, `DocumentView` — now lives in
 * `@gopasal/api-client` and is re-exported here so that existing imports of
 * `@/lib/api/types` keep resolving to one place.
 *
 * What is genuinely seller-only stays below: `toApplicantView` is not
 * `toReviewerView`. The applicant's payload has `canEdit`, keeps owner papers and
 * bank details flat rather than nested under `kyc`/`payout`, and carries no
 * internal reviewer note. Sharing one `Application` type across the two consoles
 * would compile and then be wrong at runtime.
 *
 * Source of truth: `apps/api/src/modules/onboarding/*`. Enum members are copied
 * from `apps/api/prisma/schema.prisma`.
 */

export type {
  ApiUser,
  ApplicationCategory,
  ApplicationDocument,
  ApplicationStatus,
  DocumentKind,
  DocumentReviewState,
  MeResult,
  Paginated,
  PayoutMethod,
  RequestOtpResult,
  ShopAccess,
  ShopLifecycle,
  TokenPair,
  VerifyOtpResult,
} from "@gopasal/api-client";

export {
  APPLICATION_STATUSES,
  DOCUMENT_KINDS,
  PAYOUT_METHODS,
} from "@gopasal/api-client";

import type {
  ApplicationCategory,
  ApplicationDocument,
  ApplicationStatus,
  DocumentKind,
  PayoutMethod,
  ShopLifecycle,
} from "@gopasal/api-client";

/* ── onboarding: the applicant's own view ─────────────────────────────────── */

export type TimelineEntry = {
  id: string;
  type: string;
  message: string | null;
  at: string;
};

/** The applicant's own view of their application (`toApplicantView`). */
export type Application = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  /** Human phrase from the API, e.g. "waiting for your changes". */
  statusLabel: string;
  canEdit: boolean;
  isOpen: boolean;
  /** Required fields still empty — names match the keys of `ApplicationFields`. */
  missing: string[];
  missingDocuments: DocumentKind[];

  shopName: string | null;
  shopNameNp: string | null;
  categoryId: string | null;
  description: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  area: string | null;
  fullAddress: string | null;
  lat: number | null;
  lng: number | null;
  locationAccuracyM: number | null;
  locationCapturedAt: string | null;
  locationCaptureMethod: string | null;
  deliveryRadiusKm: number;
  hours: string | null;
  soloMode: boolean;

  ownerName: string | null;
  ownerNameNp: string | null;
  citizenshipNo: string | null;
  registrationNo: string | null;
  panNo: string | null;
  vatNo: string | null;

  payoutMethod: PayoutMethod | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  walletNumber: string | null;

  category: ApplicationCategory | null;
  terms: { acceptedAt: string | null; version: string | null };
  review: {
    submittedAt: string | null;
    decidedAt: string | null;
    submitCount: number;
    /** The reviewer's note, shown verbatim to the applicant. */
    note: string | null;
    /** Field names the reviewer asked to be changed. */
    changesRequested: string[];
  };
  shop: { id: string; slug: string; name: string; status: ShopLifecycle } | null;
  documents: ApplicationDocument[];
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Every writable field, exactly as `ApplicationFieldsDto` declares it. The API
 * runs `forbidNonWhitelisted`, so sending one extra key fails the whole request
 * — this type is the allow-list, and PATCH bodies are built from it only.
 */
export type ApplicationFields = {
  shopName?: string;
  shopNameNp?: string;
  categoryId?: string;
  description?: string;
  contactPhone?: string;
  contactEmail?: string;
  area?: string;
  fullAddress?: string;
  deliveryRadiusKm?: number;
  hours?: string;
  soloMode?: boolean;
  ownerName?: string;
  ownerNameNp?: string;
  citizenshipNo?: string;
  registrationNo?: string;
  panNo?: string;
  vatNo?: string;
  payoutMethod?: PayoutMethod;
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  walletNumber?: string;
};

/** `GET /categories` — the public category list, used by the shop-type select. */
export type Category = {
  id: string;
  slug: string;
  en: string;
  np: string;
  icon: string;
  hue: string;
  sortOrder: number;
};
