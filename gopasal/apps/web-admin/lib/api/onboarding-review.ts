/**
 * Reviewer endpoints — `apps/api/src/modules/onboarding/onboarding.admin.controller.ts`.
 *
 * Tenancy here is permission-based, not ownership-based: reading is `shops.view`,
 * picking an application up and approving it are `shops.approve`, and both ways
 * of turning one down are `shops.reject`. The console hides what the signed-in
 * account may not do, but the API is the boundary — it re-checks every call.
 *
 * Every mutation returns the **whole** application as the reviewer sees it, so a
 * caller should replace its copy with the response rather than patching fields
 * locally: approving, for instance, also fills in `shop`, moves the status and
 * appends to the timeline.
 */

import { ApiError, apiUrl } from "@gopasal/api-client";
import { authedRequest, getSession } from "./client";
import type {
  ApplicationDocument,
  DocumentDecision,
  Paginated,
  QueueFilter,
  QueueRow,
  ReviewApplication,
} from "./types";

const BASE = "/admin/onboarding/applications";

export type QueueParams = {
  page?: number;
  limit?: number;
  /** Matches reference, shop name, area, contact phone or the applicant's phone. */
  q?: string;
  /** Defaults to `OPEN` server-side, which excludes drafts. */
  status?: QueueFilter;
  /** Only applications held by this reviewer. */
  reviewerId?: string;
};

/**
 * Only keys the caller actually set are sent. The API runs
 * `forbidNonWhitelisted` and validates each parameter, so an empty `q=` or a
 * `page=NaN` is a 400 rather than a helpfully ignored value.
 */
function queryString(params: QueueParams): string {
  const search = new URLSearchParams();
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const q = params.q?.trim();
  if (q) search.set("q", q);
  if (params.status) search.set("status", params.status);
  if (params.reviewerId) search.set("reviewerId", params.reviewerId);
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/** The review queue. Oldest submission first, as the server sorts it. */
export function fetchQueue(
  params: QueueParams = {},
  signal?: AbortSignal,
): Promise<Paginated<QueueRow>> {
  return authedRequest<Paginated<QueueRow>>(`${BASE}${queryString(params)}`, { signal });
}

/** One application in full: KYC, payout, internal note, documents, timeline. */
export function fetchApplication(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ReviewApplication> {
  return authedRequest<ReviewApplication>(`${BASE}/${applicationId}`, { signal });
}

/**
 * Take ownership of a review. Idempotent for whoever already holds it; a 409
 * means somebody else does, and the caller should re-read the queue rather than
 * insisting.
 */
export function claimApplication(applicationId: string): Promise<ReviewApplication> {
  return authedRequest<ReviewApplication>(`${BASE}/${applicationId}/claim`, { method: "POST" });
}

/**
 * Hand it back with instructions. `note` is required and is shown to the
 * applicant verbatim; `fields` names what they must change (each must be an
 * editable application field); `internalNote` never leaves this console.
 */
export function requestChanges(
  applicationId: string,
  input: { note: string; fields?: string[]; internalNote?: string },
): Promise<ReviewApplication> {
  const body: Record<string, unknown> = { note: input.note };
  if (input.fields?.length) body.fields = input.fields;
  if (input.internalNote?.trim()) body.internalNote = input.internalNote.trim();
  return authedRequest<ReviewApplication>(`${BASE}/${applicationId}/request-changes`, {
    method: "POST",
    body,
  });
}

/**
 * Approve, which is what creates the shop and the applicant's Owner membership.
 * Safe to retry: a second call returns the same shop rather than a second one.
 */
export function approveApplication(
  applicationId: string,
  input: { note?: string; internalNote?: string } = {},
): Promise<ReviewApplication> {
  const body: Record<string, unknown> = {};
  if (input.note?.trim()) body.note = input.note.trim();
  if (input.internalNote?.trim()) body.internalNote = input.internalNote.trim();
  return authedRequest<ReviewApplication>(`${BASE}/${applicationId}/approve`, {
    method: "POST",
    body,
  });
}

/** Reject. `note` is required — the applicant is shown it verbatim. */
export function rejectApplication(
  applicationId: string,
  input: { note: string; internalNote?: string },
): Promise<ReviewApplication> {
  const body: Record<string, unknown> = { note: input.note };
  if (input.internalNote?.trim()) body.internalNote = input.internalNote.trim();
  return authedRequest<ReviewApplication>(`${BASE}/${applicationId}/reject`, {
    method: "POST",
    body,
  });
}

/**
 * Accept or reject one document. A rejection needs a note and stops the file
 * counting towards the required set, which is what puts the applicant back in
 * control of fixing it.
 *
 * Returns only the document. The application's `missingDocuments` changes as a
 * result, so the caller must re-read the application rather than assume.
 */
export function reviewDocument(
  applicationId: string,
  documentId: string,
  input: { decision: DocumentDecision; note?: string },
): Promise<ApplicationDocument> {
  const body: Record<string, unknown> = { decision: input.decision };
  if (input.note?.trim()) body.note = input.note.trim();
  return authedRequest<ApplicationDocument>(
    `${BASE}/${applicationId}/documents/${documentId}/review`,
    { method: "POST", body },
  );
}

/**
 * Fetch a document's bytes as an object URL.
 *
 * The download route is authenticated and there are no signed URLs by design, so
 * a bare `<a href>` would arrive without the bearer token and 401. The bytes have
 * to come through `fetch` and be wrapped in a blob; the caller owns the URL and
 * must `URL.revokeObjectURL` it. Every read is audited server-side, which is
 * another reason not to prefetch these speculatively.
 */
export async function openDocument(
  applicationId: string,
  documentId: string,
): Promise<{ url: string; revoke: () => void }> {
  const session = getSession();
  if (!session) {
    throw new ApiError({ status: 401, kind: "Unauthorized", message: "Please sign in to continue." });
  }
  const res = await fetch(
    apiUrl(`${BASE}/${applicationId}/documents/${documentId}/file`),
    { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      kind: "Error",
      message:
        res.status === 404
          ? "That document is no longer available."
          : res.status === 403
            ? "You do not have permission to open this document."
            : "Could not open the document. Please try again.",
    });
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
