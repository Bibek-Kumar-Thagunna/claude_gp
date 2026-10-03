/**
 * Seller registration's rules and cache addressing, with no React in it.
 *
 * ## Why this is a file of its own
 *
 * `seller-onboarding.ts` reaches `./GopasalProvider`, which imports
 * `react-native` for `AppState`, so nothing in it can be loaded outside a phone.
 * Everything here is a plain function of its arguments, and every one of these is
 * a place where a quiet mistake costs a shopkeeper a day:
 *
 *  - **The status rules.** "Can I still type into this?", "am I waiting on
 *    GoPasal or is GoPasal waiting on me?", "does this button submit or
 *    resubmit?" — the server answers the first with `canEdit` and the rest not at
 *    all. Left to the screens, six screens invent six slightly different
 *    answers, and the one that gets it wrong shows an enabled Save that 409s.
 *  - **The upload gate.** The API decides a file's type by reading its bytes and
 *    then refuses the request if the declared `Content-Type` or the filename's
 *    extension disagrees. A picker that hands back `IMG_0001.HEIC` with
 *    `mimeType: "image/jpeg"` therefore fails *after* ten megabytes have crossed
 *    a prepaid connection. Deciding the part's name and type here, from the one
 *    mime we are prepared to claim, is what stops that.
 *  - **The draft diff.** `PATCH` runs under `forbidNonWhitelisted`: one key the
 *    DTO does not declare fails the whole request, and an empty string is
 *    meaningful (it clears the column) so `undefined` is the only way to say
 *    "leave this alone". The allow-list has to be a value a test can read.
 *
 * Mirrors `apps/api/src/modules/onboarding/application-state.ts` and
 * `apps/api/src/modules/uploads/upload-rules.ts`. Where those two are the
 * authority, this file says so and does not re-derive their arithmetic.
 */
import type {
  ApplicationStatus,
  DocumentKind,
  DocumentReviewState,
  PayoutMethod,
  ShopLifecycle,
} from "@gopasal/api-client/types";

/* ── query keys ───────────────────────────────────────────────────────────── */

/**
 * The onboarding namespace, rooted at `"seller-onboarding"` rather than at
 * `"seller"`.
 *
 * Two reasons, and the second is the one that matters. The first is collision:
 * `qk` in `./seller-wire` owns every `["seller", …]` key and a sibling module is
 * adding more of them, so a separate root cannot clash with either by
 * construction. The second is that `isShopScopedKey` treats *every* `["seller",
 * x]` with `x !== "shops"` as an answer about the selected shop, and drops it
 * when the counter switches shop. An application is an answer about the
 * *applicant* — it is what someone reads precisely because they do not have a
 * shop yet — so being swept by a shop switch would be wrong, not merely wasteful.
 */
export const oqk = {
  all: () => ["seller-onboarding"] as const,
  /** `GET /seller/onboarding/applications` — every application I have filed. */
  applications: () => ["seller-onboarding", "applications"] as const,
  /** `GET …/current` — the one still in flight, or null. */
  current: () => ["seller-onboarding", "current"] as const,
  application: (applicationId: string) =>
    ["seller-onboarding", "application", applicationId] as const,
  /**
   * The bytes of one document. Separate from the application it hangs off so
   * that refetching the application does not re-download a scan, and so a
   * KYC photograph is only ever in the cache because a screen asked for it.
   */
  documentFile: (applicationId: string, documentId: string) =>
    ["seller-onboarding", "document-file", applicationId, documentId] as const,
};

/* ── the status machine, read from the applicant's side ───────────────────── */

/**
 * The lifecycle, copied from `TRANSITIONS` in `application-state.ts`:
 *
 *   DRAFT ──submit──▶ SUBMITTED ──(reviewer claims)──▶ UNDER_REVIEW
 *                        │                                  │
 *          request_changes│  ┌──approve / reject─────────────┤
 *                        ▼  ▼                               │
 *              CHANGES_REQUESTED ──resubmit──▶ SUBMITTED    │
 *
 * APPROVED, REJECTED and WITHDRAWN are terminal; a rejected applicant starts a
 * *new* application rather than reopening this one.
 */

/** The two statuses in which the application is the applicant's to change. */
const EDITABLE_STATUSES: readonly ApplicationStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

/** Statuses that still belong to somebody — mirrors `OPEN_STATUSES`. */
const OPEN_STATUSES: readonly ApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
];

export function canEditApplication(status: ApplicationStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function isApplicationOpen(status: ApplicationStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isApplicationTerminal(status: ApplicationStatus): boolean {
  return !isApplicationOpen(status);
}

/**
 * The narrow shape the rules below need — a subset of `SellerApplication`, in the
 * style of the API's own `SubmittableApplication`.
 *
 * Declared structurally rather than importing the full view type so that a test
 * can build one in four lines, and so that adding a field to the wire payload
 * cannot quietly change what these functions read.
 */
export interface ApplicationStandingSource {
  status: ApplicationStatus;
  /** The server's own phrase, e.g. "waiting for your changes". Never re-derived. */
  statusLabel: string;
  canEdit: boolean;
  isOpen: boolean;
  /** Required fields still empty — `missingForSubmit` on the server. */
  missing: readonly string[];
  /** Required kinds not yet usable — `missingDocuments` on the server. */
  missingDocuments: readonly DocumentKind[];
  review: {
    submittedAt: string | null;
    decidedAt: string | null;
    submitCount: number;
    /** `decisionNote`, written to be read by the applicant. */
    note: string | null;
    changesRequested: readonly string[];
  };
  documents: readonly {
    id: string;
    kind: DocumentKind;
    review: DocumentReviewState;
    reviewNote: string | null;
  }[];
  shop: { id: string; slug: string; name: string; status: ShopLifecycle } | null;
}

/** What the applicant is expected to do next, if anything. */
export type ApplicationNextStep =
  /** Fill it in. `blockers` says what is still absent. */
  | "finish"
  /** Complete, unsent. The submit button is the whole screen. */
  | "submit"
  /** GoPasal has it. Nothing for the applicant to do but wait. */
  | "wait"
  /** A reviewer handed it back. `changesRequested` says which fields. */
  | "fix"
  /** Approved. The shop exists and `/auth/me` has to be re-read. */
  | "open-shop"
  /** Terminal and not approved. Trading means starting a new application. */
  | "start-again";

/**
 * Everything a registration screen needs to decide what to show, computed once.
 *
 * A bare `ApplicationStatus` forces every screen to reimplement the same six
 * rules, and the interesting ones are not derivable from the status alone:
 * whether the submit button submits or *resubmits* depends on it, whether it can
 * be enabled at all depends on two server-supplied lists, and "what was
 * rejected and why" lives partly on the application (`review.note`,
 * `review.changesRequested`) and partly on the individual documents
 * (`reviewNote`).
 */
export interface ApplicationStanding {
  status: ApplicationStatus;
  /** `statusLabel` verbatim. Phrasing is the server's job, not this file's. */
  headline: string;
  next: ApplicationNextStep;
  /** True only while the application is the applicant's to type into. */
  editable: boolean;
  /** True while the wait is GoPasal's, so a screen can say so rather than nag. */
  waitingOnGopasal: boolean;
  /**
   * Which action the one button performs, or null when there is nothing to send.
   * Both are `POST …/submit`; the distinction exists because the server records
   * them as different events and the applicant should be told which is happening.
   */
  submitAction: "submit" | "resubmit" | null;
  /** False until every required field and document is present. */
  canSubmit: boolean;
  /** Legal from DRAFT, SUBMITTED, UNDER_REVIEW and CHANGES_REQUESTED, and final. */
  withdrawable: boolean;
  /** What is still absent, straight from the server's two lists. */
  blockers: { fields: readonly string[]; documents: readonly DocumentKind[] };
  /** The reviewer's note, written to be read by the applicant. */
  decisionNote: string | null;
  /** Field names a reviewer asked about — drives the "check this" markers. */
  changesRequested: readonly string[];
  /** Documents a reviewer turned down, with the reason they gave. */
  rejectedDocuments: readonly { id: string; kind: DocumentKind; reason: string | null }[];
  /** How many times this has been sent in. 0 before the first submit. */
  submitCount: number;
  /** Set once approved — the shop the application became. */
  shop: { id: string; slug: string; name: string; status: ShopLifecycle } | null;
}

export function applicationStanding(app: ApplicationStandingSource): ApplicationStanding {
  const editable = app.canEdit;
  const complete = app.missing.length === 0 && app.missingDocuments.length === 0;
  const rejectedDocuments = app.documents
    .filter((doc) => doc.review === "REJECTED")
    .map((doc) => ({ id: doc.id, kind: doc.kind, reason: doc.reviewNote }));

  // Derived from `status` rather than from `canEdit`, because the two editable
  // statuses mean different things to the applicant: DRAFT has never been seen
  // by anybody, CHANGES_REQUESTED has been read and handed back.
  const next: ApplicationNextStep =
    app.status === "APPROVED"
      ? "open-shop"
      : app.status === "REJECTED" || app.status === "WITHDRAWN"
        ? "start-again"
        : app.status === "CHANGES_REQUESTED"
          ? "fix"
          : app.status === "DRAFT"
            ? complete
              ? "submit"
              : "finish"
            : "wait";

  return {
    status: app.status,
    headline: app.statusLabel,
    next,
    editable,
    waitingOnGopasal: app.status === "SUBMITTED" || app.status === "UNDER_REVIEW",
    submitAction: !editable
      ? null
      : app.status === "CHANGES_REQUESTED"
        ? "resubmit"
        : "submit",
    canSubmit: editable && complete,
    withdrawable: app.isOpen,
    blockers: { fields: app.missing, documents: app.missingDocuments },
    decisionNote: app.review.note,
    changesRequested: app.review.changesRequested,
    rejectedDocuments,
    submitCount: app.review.submitCount,
    shop: app.shop,
  };
}

/** Why one field is marked on the form. Null when there is nothing to say. */
export type FieldProblem =
  /** A reviewer named this field in a change request. */
  | { kind: "changes-requested" }
  /** Required at submission and still empty. */
  | { kind: "missing" }
  /** Typed here and outside what the DTO accepts — a 400 waiting to happen. */
  | { kind: "invalid"; rule: DraftRule; limit?: number };

/**
 * The marker for one field, with the reviewer's request taking precedence.
 *
 * A field can be both empty and asked-about, and in that case what the
 * shopkeeper needs to read is what GoPasal said, not "required".
 */
export function fieldProblem(
  standing: Pick<ApplicationStanding, "blockers" | "changesRequested">,
  field: string,
  localProblems: readonly DraftProblem[] = [],
): FieldProblem | null {
  if (standing.changesRequested.includes(field)) return { kind: "changes-requested" };
  const local = localProblems.find((p) => p.field === field);
  if (local) return { kind: "invalid", rule: local.rule, limit: local.limit };
  if (standing.blockers.fields.includes(field)) return { kind: "missing" };
  return null;
}

/* ── the draft ────────────────────────────────────────────────────────────── */

/**
 * Every key `ApplicationFieldsDto` declares, and nothing else.
 *
 * This is the allow-list, not documentation of one. The pipe runs `whitelist:
 * true, forbidNonWhitelisted: true`, so a single key outside this list fails the
 * whole PATCH with a 400 naming it — which on a phone means a shopkeeper's last
 * five minutes of typing silently stops being saved.
 *
 * `lat`, `lng` and `locationAccuracyM` are writable; `locationCapturedAt` and
 * `locationCaptureMethod` are not. The server stamps those two itself, because
 * they are its account of how a coordinate was obtained and a client that could
 * set them could claim a supervised capture it never performed.
 */
export const APPLICATION_FIELDS = [
  "shopName",
  "shopNameNp",
  "categoryId",
  "description",
  "contactPhone",
  "contactEmail",
  "area",
  "fullAddress",
  // The pin, taken by the applicant's own phone. Three columns describing one
  // fact, so the API writes them together or not at all — send all three or
  // none. `locationCaptureMethod` and `locationCapturedAt` are the server's
  // account of provenance and are not the applicant's to assert.
  "lat",
  "lng",
  "locationAccuracyM",
  "deliveryRadiusKm",
  "hours",
  "soloMode",
  "ownerName",
  "ownerNameNp",
  "citizenshipNo",
  "registrationNo",
  "panNo",
  "vatNo",
  "payoutMethod",
  "bankName",
  "bankBranch",
  "bankAccountNo",
  "bankAccountName",
  "walletNumber",
] as const;

export type ApplicationField = (typeof APPLICATION_FIELDS)[number];

/**
 * A partial application, in the value space a form control holds.
 *
 * Strings rather than `string | null`: the server's `blankToNull` turns `""`
 * into `NULL`, so an empty text box round-trips losslessly and a screen never
 * has to hold a null in a `TextInput`. `deliveryRadiusKm` and `soloMode` are the
 * two non-nullable columns and keep their own types.
 */
export type ApplicationDraft = {
  shopName?: string;
  shopNameNp?: string;
  categoryId?: string;
  description?: string;
  contactPhone?: string;
  contactEmail?: string;
  area?: string;
  fullAddress?: string;
  lat?: number;
  lng?: number;
  locationAccuracyM?: number;
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

/** The columns `draftFromApplication` reads. A subset of the wire view. */
export interface DraftSource {
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
}

/**
 * The server's answers as a draft: nulls become empty strings, and
 * `payoutMethod` stays absent until a choice has been made.
 *
 * `payoutMethod` is the one field where `""` would not do. It is `@IsIn` over
 * three literals, so sending an empty string is a 400 rather than a clear —
 * which is why it is left out of the draft entirely rather than blanked.
 */
export function draftFromApplication(app: DraftSource): ApplicationDraft {
  return {
    shopName: app.shopName ?? "",
    shopNameNp: app.shopNameNp ?? "",
    categoryId: app.categoryId ?? "",
    description: app.description ?? "",
    contactPhone: app.contactPhone ?? "",
    contactEmail: app.contactEmail ?? "",
    area: app.area ?? "",
    fullAddress: app.fullAddress ?? "",
    // Spread, not defaulted: an applicant who has not taken the pin yet has no
    // key in the draft, so the diff never sends a partial location.
    ...(app.lat !== null && app.lat !== undefined ? { lat: app.lat } : {}),
    ...(app.lng !== null && app.lng !== undefined ? { lng: app.lng } : {}),
    ...(app.locationAccuracyM !== null && app.locationAccuracyM !== undefined
      ? { locationAccuracyM: app.locationAccuracyM }
      : {}),
    deliveryRadiusKm: app.deliveryRadiusKm,
    hours: app.hours ?? "",
    soloMode: app.soloMode,
    ownerName: app.ownerName ?? "",
    ownerNameNp: app.ownerNameNp ?? "",
    citizenshipNo: app.citizenshipNo ?? "",
    registrationNo: app.registrationNo ?? "",
    panNo: app.panNo ?? "",
    vatNo: app.vatNo ?? "",
    ...(app.payoutMethod !== null ? { payoutMethod: app.payoutMethod } : {}),
    bankName: app.bankName ?? "",
    bankBranch: app.bankBranch ?? "",
    bankAccountNo: app.bankAccountNo ?? "",
    bankAccountName: app.bankAccountName ?? "",
    walletNumber: app.walletNumber ?? "",
  };
}

/**
 * Which keys of `next` differ from `base`, as a body fit to PATCH.
 *
 * The whole point of sending a diff rather than the form is that a registration
 * form is filled in over several sittings by two hands on a bus: the shopkeeper
 * types the PAN number while the previous save is still in flight, and a body
 * built from "everything the form currently holds" would send the *stale* copy
 * of every other field back over the top of a newer one. A diff cannot do that
 * because it only ever names what actually changed.
 */
export function draftDiff(base: ApplicationDraft, next: ApplicationDraft): ApplicationDraft {
  const from: DraftBag = base;
  const to: DraftBag = next;
  const patch: DraftBag = {};
  for (const field of APPLICATION_FIELDS) {
    const value = to[field];
    if (value === undefined) continue;
    if (value === from[field]) continue;
    patch[field] = value;
  }
  return asDraft(patch);
}

/** `{ ...base, ...edits }`, with `undefined` in `edits` meaning "not touched". */
export function mergeDraft(base: ApplicationDraft, edits: ApplicationDraft): ApplicationDraft {
  const bag: DraftBag = { ...(base as DraftBag) };
  const from: DraftBag = edits;
  for (const field of APPLICATION_FIELDS) {
    const value = from[field];
    if (value !== undefined) bag[field] = value;
  }
  return asDraft(bag);
}

/** Drop the keys a save has just persisted, keeping anything typed since. */
export function withoutFields(
  draft: ApplicationDraft,
  saved: readonly ApplicationField[],
): ApplicationDraft {
  const from: DraftBag = draft;
  const rest: DraftBag = {};
  for (const field of APPLICATION_FIELDS) {
    if (saved.includes(field)) continue;
    const value = from[field];
    if (value !== undefined) rest[field] = value;
  }
  return asDraft(rest);
}

/** The keys a draft actually carries — what `withoutFields` is given after a save. */
export function draftFields(draft: ApplicationDraft): ApplicationField[] {
  return APPLICATION_FIELDS.filter((field) => draft[field] !== undefined);
}

export function isDraftEmpty(draft: ApplicationDraft): boolean {
  return draftFields(draft).length === 0;
}

/**
 * A draft seen as a uniform bag, so the four functions above can be written as
 * one loop each instead of twenty-three assignments.
 *
 * `ApplicationDraft[K]` is a different type for every `K`, and a loop over the key
 * list cannot prove to the compiler that a value read under one key belongs in the
 * same key of another object — so a per-key write does not typecheck however it is
 * spelled. Widening to the union of value types is what makes it expressible.
 * `ApplicationDraft` is assignable to this *without* a cast, which is the half
 * that matters: nothing can be put into a bag that was not already a legal draft
 * value.
 */
type DraftBag = Partial<Record<ApplicationField, string | number | boolean>>;

/**
 * The narrowing back, in one place.
 *
 * Sound by construction rather than by inspection: every value in a bag built by
 * the functions above was copied out of an `ApplicationDraft` under the *same*
 * key, so `payoutMethod` is still one of the three literals even though the bag
 * had forgotten it. Nothing else in this file may build a bag, which is why this
 * is private.
 */
function asDraft(bag: DraftBag): ApplicationDraft {
  return bag as ApplicationDraft;
}

/* ── draft validation ─────────────────────────────────────────────────────── */

/** Which rule a value breaks. Each maps to one decorator on `ApplicationFieldsDto`. */
export type DraftRule = "too-long" | "too-short" | "not-an-email" | "out-of-range";

export interface DraftProblem {
  field: ApplicationField;
  rule: DraftRule;
  /** The bound that was broken, for a screen that wants to say "120 max". */
  limit?: number;
}

/**
 * `@MaxLength` / `@MinLength` on `ApplicationFieldsDto`, field for field.
 *
 * Mirrored rather than guessed because the failure is invisible until it
 * matters: a shopkeeper typing a long address gets a 400 on the *autosave*, and
 * an autosave that fails silently is a form that quietly stops working. With the
 * bounds here the input can simply stop accepting characters.
 */
export const DRAFT_LIMITS: Readonly<Record<ApplicationField, { max?: number; min?: number }>> = {
  shopName: { min: 2, max: 120 },
  shopNameNp: { max: 120 },
  categoryId: { max: 60 },
  description: { max: 1000 },
  contactPhone: { max: 20 },
  contactEmail: { max: 160 },
  area: { max: 160 },
  fullAddress: { max: 300 },
  lat: {},
  lng: {},
  locationAccuracyM: {},
  deliveryRadiusKm: {},
  hours: { max: 120 },
  soloMode: {},
  ownerName: { max: 120 },
  ownerNameNp: { max: 120 },
  citizenshipNo: { max: 40 },
  registrationNo: { max: 40 },
  panNo: { max: 40 },
  vatNo: { max: 40 },
  payoutMethod: {},
  bankName: { max: 120 },
  bankBranch: { max: 120 },
  bankAccountNo: { max: 40 },
  bankAccountName: { max: 120 },
  walletNumber: { max: 20 },
};

/** `@Min(0.5) @Max(20)` on `deliveryRadiusKm`. */
export const DELIVERY_RADIUS_RANGE = { min: 0.5, max: 20 } as const;

/**
 * What this draft would be refused for, before it is sent.
 *
 * `@MinLength(2)` on `shopName` is only checked for a non-empty value: `""` is
 * the documented way to clear the column, and treating it as one character short
 * would make the field impossible to empty.
 */
export function checkDraft(draft: ApplicationDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  for (const field of APPLICATION_FIELDS) {
    const value = draft[field];
    if (typeof value !== "string") continue;
    const { max, min } = DRAFT_LIMITS[field];
    if (max !== undefined && value.length > max) {
      problems.push({ field, rule: "too-long", limit: max });
      continue;
    }
    if (min !== undefined && value.length > 0 && value.trim().length < min) {
      problems.push({ field, rule: "too-short", limit: min });
    }
  }

  // `@IsEmail()` has no `@IsOptional()` escape for a present-but-empty string, so
  // a half-typed address is a 400 on the next autosave rather than on submit.
  const email = draft.contactEmail;
  if (email !== undefined && email.trim() !== "" && !looksLikeEmail(email)) {
    problems.push({ field: "contactEmail", rule: "not-an-email" });
  }

  const radius = draft.deliveryRadiusKm;
  if (
    radius !== undefined &&
    (!Number.isFinite(radius) ||
      radius < DELIVERY_RADIUS_RANGE.min ||
      radius > DELIVERY_RADIUS_RANGE.max)
  ) {
    problems.push({ field: "deliveryRadiusKm", rule: "out-of-range" });
  }

  return problems;
}

/**
 * Deliberately loose: one `@`, something either side, a dot in the domain.
 *
 * `class-validator`'s `isEmail` is far stricter and this cannot reproduce it, so
 * anything this accepts may still be refused. That is the right way round — a
 * client check that is *tighter* than the server's forbids addresses the API
 * would have taken, which is the UI disagreeing with the API about what is
 * possible.
 */
function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return false;
  const domain = trimmed.slice(at + 1);
  return domain.length >= 3 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/* ── documents: what a phone may send ─────────────────────────────────────── */

/**
 * The four types a KYC document may be — `DOCUMENT_MIME_TYPES` in
 * `apps/api/src/modules/uploads/upload-rules.ts`.
 *
 * Three image formats because a citizenship card is photographed rather than
 * scanned, plus PDF for the multi-page registration papers a registered business
 * has. Nothing else: HEIC, TIFF and BMP are all refused, which matters because
 * HEIC is what an unconfigured iPhone hands over.
 */
export const DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type DocumentMime = (typeof DOCUMENT_MIME_TYPES)[number];

/** `MIME_ALIASES` on the server: spellings phones and pickers produce. */
const MIME_ALIASES: Readonly<Record<string, DocumentMime>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "application/x-pdf": "application/pdf",
};

/** `CANONICAL_EXTENSION`. The only suffix the part's filename is ever given. */
const CANONICAL_EXTENSION: Readonly<Record<DocumentMime, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** `EXTENSION_MEANS`: the spellings the server will accept on a filename. */
const EXTENSION_MEANS: Readonly<Record<string, DocumentMime>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * The size a document is actually judged against: `UPLOAD_MAX_DOCUMENT_BYTES`,
 * whose default is 10 MiB.
 *
 * **This is a default, not a promise.** It is an environment variable on the API,
 * so a deployment may have set it lower, and only the server knows. The check in
 * `checkDocumentPick` is therefore an optimisation — it saves a shopkeeper from
 * pushing a 12 MB photograph up a prepaid link to be told no — and never an
 * authority. A 413 with the server's own sentence is still the real answer.
 */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * `MULTIPART_HARD_LIMIT_BYTES` — the ceiling multer is given at decoration time,
 * independent of the configured one, together with `files: 1`.
 *
 * Worth knowing because it fails differently: a body over this is cut off
 * mid-request rather than validated, so the applicant gets a truncated-upload
 * error instead of "that file is too big". `validateConfig` refuses to boot if
 * the configured ceiling is above this number, so nothing can fall between them.
 */
export const MULTIPART_HARD_LIMIT_BYTES = 32 * 1024 * 1024;

/** `MAX_DOCUMENTS_PER_APPLICATION`. A 409 beyond it, counted after replacement. */
export const MAX_DOCUMENTS_PER_APPLICATION = 12;

/** The multipart field name the `FileInterceptor` is constructed with. */
export const DOCUMENT_FILE_FIELD = "file";

/**
 * Kinds an application may hold only one of — `isSingleInstanceKind`.
 *
 * Re-uploading one of these *replaces* what was there, which is the commonest
 * thing that happens in this wizard ("take it again, the flash washed it out").
 * `OTHER` accumulates, which is also why a retried upload of `OTHER` leaves two
 * rows and why the upload mutation must not be retried automatically.
 */
export function isSingleInstanceKind(kind: DocumentKind): boolean {
  return kind !== "OTHER";
}

/**
 * What a React Native image or document picker hands back, structurally.
 *
 * Declared here rather than imported so this package takes no dependency on a
 * picker the apps have not installed yet. The two libraries name the same four
 * things differently, and a screen maps whichever it uses:
 *
 *  - `expo-image-picker`'s `ImagePickerAsset`:
 *    `{ uri, fileName, mimeType, fileSize }`
 *  - `expo-document-picker`'s `DocumentPickerAsset`:
 *    `{ uri, name, mimeType, size }`
 *
 * `size` is genuinely optional: `fileSize` is absent on some platforms, and when
 * it is, the size check simply cannot run here.
 */
export interface PickedFile {
  /** A local `file://` (or `content://`) URI. Not read by this package. */
  uri: string;
  /** `fileName` / `name`. Used only to *guess* the type when `mimeType` is absent. */
  name?: string | null;
  mimeType?: string | null;
  /** Bytes, if the picker knew. */
  size?: number | null;
}

/**
 * The three things `FormData` needs for a file part on React Native.
 *
 * `name` is rebuilt rather than passed through, and that is the whole reason
 * this function exists — see `checkDocumentPick`.
 */
export interface DocumentFilePart {
  uri: string;
  name: string;
  type: DocumentMime;
}

export type DocumentPickRejection =
  /** The picker reported zero bytes. `checkUpload` answers 400 for this. */
  | "EMPTY"
  /** Over `DOCUMENT_MAX_BYTES`. The server answers 413, not 400. */
  | "TOO_LARGE"
  /** Neither the mime nor the filename names a type GoPasal accepts. */
  | "UNSUPPORTED_TYPE"
  /** No mime and no usable extension — nothing to declare the part as. */
  | "UNKNOWN_TYPE";

export type DocumentPick =
  | { ok: true; part: DocumentFilePart; mime: DocumentMime }
  | { ok: false; code: DocumentPickRejection; limit?: number };

/**
 * Turn a picked file into a part the API will accept, or say why it will not.
 *
 * The server compares **three** independent claims about an upload — the
 * declared `Content-Type`, the extension on the filename, and the magic bytes it
 * reads itself — and refuses on any disagreement. The bytes are not ours to
 * change, so the only way to keep all three consistent is to derive the other
 * two from one decision:
 *
 *  1. resolve a mime (the picker's, aliased; failing that, from the extension),
 *  2. declare exactly that,
 *  3. name the part `<kind>.<canonical extension for that mime>`.
 *
 * Passing the picker's own filename straight through is what breaks: an iPhone
 * hands back `IMG_0042.HEIC` with `mimeType: "image/jpeg"` for a photo it has
 * already transcoded to JPEG, and the server — reading JPEG bytes, a JPEG
 * `Content-Type` and a `.heic` name — answers `CONTENT_MISMATCH`. The bytes and
 * the type were fine; only the name was stale.
 */
export function checkDocumentPick(pick: PickedFile, kind: DocumentKind): DocumentPick {
  const size = pick.size ?? null;
  if (size !== null && size <= 0) return { ok: false, code: "EMPTY" };
  if (size !== null && size > DOCUMENT_MAX_BYTES) {
    return { ok: false, code: "TOO_LARGE", limit: DOCUMENT_MAX_BYTES };
  }

  const declared = normaliseDocumentMime(pick.mimeType);
  const fromName = mimeFromFileName(pick.name);

  // A declared type we recognise wins. When the picker declared *something* we
  // do not accept, that is a refusal rather than a reason to fall back to the
  // extension: the two disagreeing means one of them is wrong, and guessing
  // which is how a HEIC gets sent up as a JPEG and rejected at the far end.
  const mime = declared ?? fromName;
  if (mime === null) {
    return {
      ok: false,
      code: pick.mimeType || pick.name ? "UNSUPPORTED_TYPE" : "UNKNOWN_TYPE",
    };
  }

  return {
    ok: true,
    mime,
    part: { uri: pick.uri, name: `${kind.toLowerCase()}.${CANONICAL_EXTENSION[mime]}`, type: mime },
  };
}

/** `normaliseMime`: lower-cased, parameters dropped, aliased, then allow-listed. */
export function normaliseDocumentMime(declared: string | null | undefined): DocumentMime | null {
  const bare = (declared ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (bare === "") return null;
  const aliased = MIME_ALIASES[bare] ?? bare;
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(aliased)
    ? (aliased as DocumentMime)
    : null;
}

/** `declaredExtension` + `EXTENSION_MEANS`, for a picker that reported no type. */
export function mimeFromFileName(fileName: string | null | undefined): DocumentMime | null {
  const base = (fileName ?? "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return EXTENSION_MEANS[base.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Whether a screen may still attach or remove documents.
 *
 * The same rule as the fields: `DocumentsService.editableOrThrow` refuses while
 * the application is SUBMITTED or UNDER_REVIEW ("withdrawing evidence from
 * underneath a reviewer"), and a document on an approved application is part of
 * the record of why it was approved.
 */
export function canChangeDocuments(status: ApplicationStatus): boolean {
  return canEditApplication(status);
}

/**
 * Whether one more attachment fits, counting a replacement as free.
 *
 * Mirrors the service's own arithmetic: the cap is applied to what will *remain*
 * after a single-instance kind supersedes its predecessor, so re-taking a
 * citizenship photo is never blocked by a full application.
 */
export function documentSlotAvailable(
  attached: readonly { kind: DocumentKind }[],
  kind: DocumentKind,
): boolean {
  const superseded = isSingleInstanceKind(kind)
    ? attached.filter((doc) => doc.kind === kind).length
    : 0;
  return attached.length - superseded < MAX_DOCUMENTS_PER_APPLICATION;
}

/* ── error envelopes ──────────────────────────────────────────────────────── */

/**
 * A response body that may or may not be JSON, and may be empty.
 *
 * The upload is sent with `fetch` rather than through the transport, so it reads
 * the body as text and parses it here — `res.json()` throws on the empty body a
 * 413 from multer can produce, and an error path that throws its own error is how
 * "that file is too big" becomes "Couldn't reach GoPasal".
 */
export function parseJsonBody(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * The message out of an API error envelope, for the one request that does not go
 * through `http.request`.
 *
 * The multipart upload is sent with `fetch` directly (see the note in
 * `seller-onboarding.ts`), so it has to unpack the same envelope the transport
 * unpacks — `{ statusCode, error, message, path, timestamp, …details }`, where
 * `message` is a string or an array of them. Extracted here so the two agree and
 * so the unwrapping can be tested without a socket.
 */
export function apiErrorMessage(status: number, body: unknown): string {
  const envelope = isRecord(body) ? body : {};
  const raw = envelope.message;
  if (Array.isArray(raw)) {
    const lines = raw.filter((m): m is string => typeof m === "string");
    if (lines.length > 0) return lines.join("\n");
  }
  if (typeof raw === "string" && raw !== "") return raw;
  return `Request failed (${status})`;
}

/** The field-level detail the API attaches below 500 — `missing`, `missingDocuments`. */
export function apiErrorDetails(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return {};
  const { statusCode, error, message, path, timestamp, ...details } = body;
  void statusCode;
  void error;
  void message;
  void path;
  void timestamp;
  return details;
}

/**
 * What a refused submit was missing, narrowed out of the error's details.
 *
 * `OnboardingService.submit` throws a `BadRequestException` whose body carries
 * `missing` (field names) and `missingDocuments` (document kinds) beside the
 * sentence. A screen that shows `error.message` alone tells the shopkeeper that
 * "some required details are still missing" without saying which, which is the
 * one thing they need — so this is the narrowing, done once.
 */
export function submitRefusal(details: Record<string, unknown> | undefined): {
  fields: string[];
  documents: DocumentKind[];
} {
  return {
    fields: stringList(details?.missing),
    documents: stringList(details?.missingDocuments).filter(isDocumentKind),
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isDocumentKind(value: string): value is DocumentKind {
  return (
    value === "CITIZENSHIP_FRONT" ||
    value === "CITIZENSHIP_BACK" ||
    value === "PAN_CERTIFICATE" ||
    value === "VAT_CERTIFICATE" ||
    value === "BUSINESS_LICENCE" ||
    value === "REGULATORY_LICENCE" ||
    value === "SHOP_PHOTO" ||
    value === "OWNER_PHOTO" ||
    value === "BANK_PROOF" ||
    value === "OTHER"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
