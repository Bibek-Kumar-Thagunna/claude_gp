/**
 * Wire types for the GoPasal API, as the admin console sees them.
 *
 * Anything the API serialises the same way for every browser surface — the auth
 * payloads, the pagination envelope, the onboarding enums, `DocumentView` — now
 * lives in `@gopasal/api-client` and is re-exported here so that existing imports
 * of `@/lib/api/types` keep resolving to one place.
 *
 * What is genuinely reviewer-only stays below, and it is not a superset of the
 * applicant's view: `toReviewerView` has no `canEdit`, calls the decision note
 * `review.decisionNote`, nests owner papers under `kyc` and bank details under
 * `payout`, masks the applicant's account phone, and carries the internal reviewer
 * note plus event `meta` the applicant never sees. Reusing the seller console's
 * `Application` type here would compile and then be wrong at runtime.
 *
 * Source of truth: `apps/api/src/modules/onboarding/*` (`toReviewerView`,
 * `toQueueRow`). Enum members are copied from `apps/api/prisma/schema.prisma`.
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

import {
  APPLICATION_STATUSES,
  type ApplicationCategory,
  type ApplicationDocument,
  type ApplicationStatus,
  type DocumentKind,
  type PayoutMethod,
  type ShopLifecycle,
} from "@gopasal/api-client";

/* ── onboarding: reviewer-only enums ──────────────────────────────────────── */

/**
 * What the queue's `status` query parameter accepts. `OPEN` is the default and
 * means "everything a reviewer could act on" — which excludes `DRAFT`, because
 * an application nobody has submitted is not waiting on GoPasal.
 */
export const QUEUE_FILTERS = ["OPEN", "ALL", ...APPLICATION_STATUSES] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

/** Statuses on which approve / reject / request-changes are accepted. */
export const DECIDABLE_STATUSES: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

/** The reviewer's decision on one document. `PENDING` is not an accepted input. */
export type DocumentDecision = "ACCEPTED" | "REJECTED";

/* ── onboarding: the reviewer's view ──────────────────────────────────────── */

/** A timeline event as the reviewer sees it — with `meta` and `actorId`. */
export type ReviewTimelineEntry = {
  id: string;
  type: string;
  message: string | null;
  meta: Record<string, unknown> | null;
  actorId: string | null;
  at: string;
};

/** A named user as the API nests it in review payloads (`name` may be unset). */
export type NamedUser = { id: string; name: string | null };

/** One row of `GET /admin/onboarding/applications` (`toQueueRow`). */
export type QueueRow = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  /** Human phrase from the API, e.g. "waiting for your changes". */
  statusLabel: string;
  shopName: string | null;
  area: string | null;
  /** The shop's public number — full, because ringing it is part of the check. */
  contactPhone: string | null;
  category: { id: string; en: string; np: string } | null;
  payoutMethod: PayoutMethod | null;
  /** Last digits only; the queue never carries a full account number. */
  payoutAccountMasked: string | null;
  documentCount: number;
  applicant: { id: string; name: string | null; phoneMasked: string };
  reviewer: NamedUser | null;
  submittedAt: string | null;
  submitCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * `GET /admin/onboarding/applications/:id` (`toReviewerView`) — everything a
 * decision needs, and nothing a queue row would leak.
 */
export type ReviewApplication = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  statusLabel: string;
  isOpen: boolean;
  /** Required fields still empty, by field name. Server-computed, not guessed. */
  missing: string[];
  /** Required document kinds absent or rejected. A rejected file counts as absent. */
  missingDocuments: DocumentKind[];
  /** Required papers that still need an explicit reviewer acceptance. */
  approvalMissingDocuments: DocumentKind[];

  applicant: {
    id: string;
    name: string | null;
    /** The account phone is a login identifier, so it is masked even here. */
    phoneMasked: string;
    email: string | null;
    joinedAt: string;
  };

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

  kyc: {
    ownerName: string | null;
    ownerNameNp: string | null;
    citizenshipNo: string | null;
    registrationNo: string | null;
    panNo: string | null;
    vatNo: string | null;
  };

  payout: {
    payoutMethod: PayoutMethod | null;
    bankName: string | null;
    bankBranch: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
    walletNumber: string | null;
  };

  category: ApplicationCategory | null;
  terms: { acceptedAt: string | null; version: string | null };
  review: {
    submittedAt: string | null;
    decidedAt: string | null;
    submitCount: number;
    /** The note the applicant was given with the last decision. */
    decisionNote: string | null;
    /** Field names a reviewer asked to be changed. */
    changesRequested: string[];
  };
  /** Reviewer-only: never shown to the applicant by the API. */
  internal: { reviewerNote: string | null; reviewer: NamedUser | null };
  shop: { id: string; slug: string; name: string; status: ShopLifecycle } | null;
  documents: ApplicationDocument[];
  timeline: ReviewTimelineEntry[];
  createdAt: string;
  updatedAt: string;
};
