import type { ApplicationStatus, PayoutMethod, ShopDocumentKind } from '@prisma/client';

/**
 * The seller-onboarding state machine, kept deliberately free of Nest, Prisma
 * and HTTP so it can be reasoned about — and tested — on its own.
 *
 * Every status change in the module goes through `checkTransition`, applied by
 * the service's single `applyTransition` helper (or, for approval, by the same
 * guard expressed as a conditional `updateMany`). Nothing else is allowed to
 * write `ShopApplication.status`, which is what makes the matrix below the whole
 * truth about the lifecycle rather than a comment that drifts away from the code.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──claim──▶ UNDER_REVIEW
 *                        │  │                  │  │  │
 *          request_changes│  └─approve/reject───┘  │  └─request_changes
 *                        ▼                         ▼
 *              CHANGES_REQUESTED ──resubmit──▶ SUBMITTED
 *
 * APPROVED / REJECTED / WITHDRAWN are terminal. A rejected applicant is not
 * locked out — they start a *new* application, so the rejected one survives as
 * the record of what was decided and why.
 */

/** What someone is trying to do, named the way the API names it. */
export type ApplicationAction =
  | 'submit'
  | 'resubmit'
  | 'withdraw'
  | 'claim'
  | 'request_changes'
  | 'approve'
  | 'reject';

interface TransitionDef {
  from: readonly ApplicationStatus[];
  to: ApplicationStatus;
  /** `ShopApplicationEvent.type` written when the transition succeeds. */
  event: string;
  /** Said to the caller when the transition is not legal from here. */
  refusal: string;
}

export const TRANSITIONS: Readonly<Record<ApplicationAction, TransitionDef>> = {
  submit: {
    from: ['DRAFT'],
    to: 'SUBMITTED',
    event: 'submitted',
    refusal: 'This application has already been submitted.',
  },
  resubmit: {
    from: ['CHANGES_REQUESTED'],
    to: 'SUBMITTED',
    event: 'resubmitted',
    refusal: 'There is nothing to resubmit — GoPasal has not asked for any changes.',
  },
  withdraw: {
    from: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
    to: 'WITHDRAWN',
    event: 'withdrawn',
    refusal: 'This application is already closed, so there is nothing to withdraw.',
  },
  claim: {
    from: ['SUBMITTED'],
    to: 'UNDER_REVIEW',
    event: 'picked_up',
    refusal: 'Only a newly submitted application can be picked up for review.',
  },
  request_changes: {
    from: ['SUBMITTED', 'UNDER_REVIEW'],
    to: 'CHANGES_REQUESTED',
    event: 'changes_requested',
    refusal: 'Changes can only be requested while an application is awaiting a decision.',
  },
  approve: {
    from: ['SUBMITTED', 'UNDER_REVIEW'],
    to: 'APPROVED',
    event: 'approved',
    refusal: 'Only an application awaiting a decision can be approved.',
  },
  reject: {
    from: ['SUBMITTED', 'UNDER_REVIEW'],
    to: 'REJECTED',
    event: 'rejected',
    refusal: 'Only an application awaiting a decision can be rejected.',
  },
};

/** Statuses that still belong to somebody — a queue item or an open draft. */
export const OPEN_STATUSES: readonly ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
];

/** Statuses a reviewer may act on. Also the guard on the approval claim. */
export const DECIDABLE_STATUSES: readonly ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

/**
 * What the review queue shows by default. Open minus DRAFT: an unsubmitted
 * draft is the applicant's private workspace, not somebody's work item.
 */
export const REVIEWABLE_STATUSES: readonly ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
];

/** The two statuses in which the application is the applicant's to change. */
export const EDITABLE_STATUSES: readonly ApplicationStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];

export function isOpen(status: ApplicationStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isTerminal(status: ApplicationStatus): boolean {
  return !isOpen(status);
}

/**
 * The applicant may only type into an application that is theirs to type into.
 * Editing while a reviewer has it open would change the thing being reviewed
 * underneath them, so SUBMITTED and UNDER_REVIEW are read-only until the
 * reviewer hands it back with `request_changes`.
 */
export function canEdit(status: ApplicationStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export interface TransitionVerdict {
  allowed: boolean;
  to: ApplicationStatus;
  event: string;
  /** Plain-language refusal, safe to show the caller. */
  reason?: string;
}

export function checkTransition(
  from: ApplicationStatus,
  action: ApplicationAction,
): TransitionVerdict {
  const def = TRANSITIONS[action];
  const allowed = def.from.includes(from);
  return {
    allowed,
    to: def.to,
    event: def.event,
    reason: allowed ? undefined : `${def.refusal} (it is currently ${humanStatus(from)}.)`,
  };
}

/** Sentence-case status for messages the applicant reads. */
export function humanStatus(status: ApplicationStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'a draft';
    case 'SUBMITTED':
      return 'submitted and waiting for review';
    case 'UNDER_REVIEW':
      return 'being reviewed';
    case 'CHANGES_REQUESTED':
      return 'waiting for your changes';
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'not approved';
    case 'WITHDRAWN':
      return 'withdrawn';
  }
}

// ───────────────────────────── completeness ──────────────────────────────────

/**
 * Fields the applicant fills in. Used both to bound what `PATCH` may write and
 * to validate the field names a reviewer highlights in a change request, so the
 * wizard can never be handed a field it does not render.
 */
export const EDITABLE_FIELDS = [
  'shopName',
  'shopNameNp',
  'categoryId',
  'description',
  'contactPhone',
  'contactEmail',
  'area',
  'fullAddress',
  // The pin the applicant took with their own phone. `locationCaptureMethod`
  // is absent on purpose: it is the server's account of how a coordinate was
  // obtained, not the client's to assert.
  'lat',
  'lng',
  'locationAccuracyM',
  'deliveryRadiusKm',
  'hours',
  'soloMode',
  'ownerName',
  'ownerNameNp',
  'citizenshipNo',
  'registrationNo',
  'panNo',
  'vatNo',
  'payoutMethod',
  'bankName',
  'bankBranch',
  'bankAccountNo',
  'bankAccountName',
  'walletNumber',
  'documents',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export function isEditableField(name: string): name is EditableField {
  return (EDITABLE_FIELDS as readonly string[]).includes(name);
}

/**
 * What must be present before an application can be submitted. A marketplace
 * shop must identify both the person and the legally registered business behind
 * it. The verified pin is deliberately not in this list: an applicant may skip
 * location and complete it from the approved shop's settings. Until then the
 * storefront eligibility query keeps the shop private. VAT remains conditional
 * because not every PAN-registered business is required to register for VAT.
 */
const REQUIRED_AT_SUBMIT = [
  'shopName',
  'categoryId',
  'contactPhone',
  'area',
  'fullAddress',
  'ownerName',
  'citizenshipNo',
  'registrationNo',
  'panNo',
  'payoutMethod',
] as const;

/** The shape `missingForSubmit` needs — a subset of the Prisma row. */
export interface SubmittableApplication {
  shopName: string | null;
  categoryId: string | null;
  contactPhone: string | null;
  area: string | null;
  fullAddress: string | null;
  lat?: number | null;
  lng?: number | null;
  locationCapturedAt?: Date | string | null;
  ownerName: string | null;
  citizenshipNo: string | null;
  registrationNo: string | null;
  panNo: string | null;
  payoutMethod: PayoutMethod | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  walletNumber: string | null;
}

/**
 * Which required fields are still empty. Returned as a list rather than thrown
 * as a sentence so the wizard can mark the offending steps.
 *
 * Payout details are conditional on the method: a bank transfer needs an
 * account, a wallet needs a number, and asking for both is how a form gets
 * abandoned.
 */
export function missingForSubmit(app: SubmittableApplication): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_AT_SUBMIT) {
    const value = app[field];
    if (value === null || (typeof value === 'string' && value.trim() === '')) missing.push(field);
  }

  if (app.payoutMethod === 'BANK') {
    if (!app.bankName?.trim()) missing.push('bankName');
    if (!app.bankAccountNo?.trim()) missing.push('bankAccountNo');
    if (!app.bankAccountName?.trim()) missing.push('bankAccountName');
  } else if (app.payoutMethod === 'ESEWA' || app.payoutMethod === 'KHALTI') {
    if (!app.walletNumber?.trim()) missing.push('walletNumber');
  }

  return missing;
}

// ────────────────────────────── documents ────────────────────────────────────

/**
 * Which documents an application cannot be submitted without.
 *
 * This is the marketplace KYC floor: owner identity, legal business
 * registration, tax identity, and evidence that the physical shop exists.
 */
const ALWAYS_REQUIRED_DOCUMENTS: readonly ShopDocumentKind[] = [
  'CITIZENSHIP_FRONT',
  'CITIZENSHIP_BACK',
  'BUSINESS_LICENCE',
  'PAN_CERTIFICATE',
  'SHOP_PHOTO',
];

/** Categories in the current catalogue whose trade needs a regulator licence. */
const REGULATED_CATEGORY_SLUGS = new Set(['pharmacy']);

/**
 * Which documents this particular application needs, given how the applicant
 * chose to be paid. A bank payout is verified against proof of the account —
 * paying settlement money into a mistyped account number is close to
 * irreversible — while a wallet payout is verified against the wallet number
 * itself, so no extra document is demanded of a seller who has no bank.
 */
export function requiredDocuments(
  payoutMethod: PayoutMethod | null,
  vatNo?: string | null,
  categorySlug?: string | null,
): ShopDocumentKind[] {
  const required = [...ALWAYS_REQUIRED_DOCUMENTS];
  if (vatNo?.trim()) required.push('VAT_CERTIFICATE');
  if (categorySlug && REGULATED_CATEGORY_SLUGS.has(categorySlug)) {
    required.push('REGULATORY_LICENCE');
  }
  if (payoutMethod === 'BANK') required.push('BANK_PROOF');
  return required;
}

/** The shape `missingDocuments` needs: the payout choice and what is attached. */
export interface DocumentBearingApplication {
  payoutMethod: PayoutMethod | null;
  vatNo?: string | null;
  category?: { slug: string } | null;
  documents: readonly { kind: ShopDocumentKind; review?: 'PENDING' | 'ACCEPTED' | 'REJECTED' }[];
}

/**
 * Which required documents are still missing. Returned as a list, like
 * `missingForSubmit`, so the wizard can mark the steps rather than show one
 * sentence about an unnamed problem.
 *
 * A document a reviewer has already REJECTED does not count as present. That is
 * the whole point of `request_changes`: if a blurred citizenship photo still
 * satisfied the requirement, the applicant could resubmit the same application
 * unchanged and the queue would cycle forever.
 */
export function missingDocuments(app: DocumentBearingApplication): ShopDocumentKind[] {
  const usable = new Set(
    app.documents.filter((doc) => doc.review !== 'REJECTED').map((doc) => doc.kind),
  );
  return requiredDocuments(app.payoutMethod, app.vatNo, app.category?.slug).filter(
    (kind) => !usable.has(kind),
  );
}

/**
 * Approval is stricter than submission: every required paper must have an
 * explicit reviewer acceptance. A pending upload is enough to enter the queue,
 * but never enough to create a shop that can trade.
 */
export function unverifiedDocuments(app: DocumentBearingApplication): ShopDocumentKind[] {
  const accepted = new Set(
    app.documents.filter((doc) => doc.review === 'ACCEPTED').map((doc) => doc.kind),
  );
  return requiredDocuments(app.payoutMethod, app.vatNo, app.category?.slug).filter(
    (kind) => !accepted.has(kind),
  );
}

/**
 * Kinds an applicant may hold only one of. Re-uploading one of these replaces
 * what was there, because "take the photo again" is the commonest thing that
 * happens in this wizard and two citizenship fronts would leave a reviewer
 * deciding which is the real one. `OTHER` is exempt: it is the bucket for
 * whatever a reviewer asked for in a change request, and there may be several.
 */
export function isSingleInstanceKind(kind: ShopDocumentKind): boolean {
  return kind !== 'OTHER';
}

/**
 * A ceiling on attachments per application. Not a business rule — a bound on
 * what one authenticated applicant can put on the platform's disk before
 * anybody reviews them.
 */
export const MAX_DOCUMENTS_PER_APPLICATION = 12;
