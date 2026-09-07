import type { DocumentReviewState, ShopDocumentKind } from '@prisma/client';

/**
 * The only serialisation of a `ShopDocument` in this codebase.
 *
 * It exists as one exported function rather than as an object literal inside each
 * view because of what it must *not* contain: `storageKey`. A key is not a secret
 * — private objects are protected by an authorised endpoint, not by an unguessable
 * name — but it is an internal address, it names the storage layout, and there is
 * no reason for a browser to ever hold one. Two hand-written copies of this
 * mapping would be two chances for somebody to add `...doc` to the wrong one.
 *
 * The bytes are reached by document id, through a route that checks the caller.
 */

/** The columns a view needs. Narrower than `ShopDocument` so a `select` also fits. */
export interface DocumentRow {
  id: string;
  kind: ShopDocumentKind;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  review: DocumentReviewState;
  reviewNote: string | null;
  createdAt: Date;
}

export interface DocumentView {
  id: string;
  kind: ShopDocumentKind;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  review: DocumentReviewState;
  /** Why a reviewer turned it down, written to be read by the applicant. */
  reviewNote: string | null;
  uploadedAt: Date;
}

export function toDocumentView(doc: DocumentRow): DocumentView {
  return {
    id: doc.id,
    kind: doc.kind,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    review: doc.review,
    reviewNote: doc.reviewNote,
    uploadedAt: doc.createdAt,
  };
}
