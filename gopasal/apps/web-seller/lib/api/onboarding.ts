/**
 * Seller onboarding endpoints — `apps/api/src/modules/onboarding/onboarding.seller.controller.ts`.
 *
 * Tenancy on these routes is ownership, not permissions: every query is scoped
 * by the applicant id on the access token, which is why none of them needs an
 * `X-Shop-Id` header (the shop does not exist yet) or a permission key.
 */

import { ApiError } from "@gopasal/api-client";
import { authedBlob, authedRequest } from "./client";
import type {
  Application,
  ApplicationDocument,
  ApplicationFields,
  DocumentKind,
} from "./types";

const BASE = "/seller/onboarding/applications";

// Application and document ids reach the URL as path segments, so every one of them
// below goes through `encodeURIComponent`, exactly as every other module in
// `lib/api` encodes the ids it is handed. Today's values are server-generated cuids
// that need no escaping — the encoding is what keeps that a property of the data
// rather than an assumption this file makes about it.

/**
 * Create a draft, or adopt the open one that already exists.
 *
 * The server makes this upsert-ish on purpose — a seller who refreshes the page
 * must not end up with two applications — so the console can call it whenever it
 * finds no current application without guarding against duplicates itself.
 */
export function createApplication(fields: ApplicationFields = {}): Promise<Application> {
  return authedRequest<Application>(BASE, { method: "POST", body: fields });
}

/*
 * `GET …/applications/current` has no wrapper here, on purpose.
 *
 * It answers with the one application still in flight, or `null`. The wizard needs
 * something slightly different: the open application if there is one, and
 * otherwise the most recent, so a seller whose application was rejected or
 * withdrawn still sees that decision instead of an empty "apply" screen. Only
 * `listApplications` can answer that, and it arrives in one request — so a helper
 * for `/current` would have been a second way to ask a question the console does
 * not have. The route itself is untouched and still served.
 */

/** Every application this applicant has ever filed, newest first. */
export async function listApplications(signal?: AbortSignal): Promise<Application[]> {
  const res = await authedRequest<{ data: Application[] }>(BASE, { signal });
  return res.data;
}

export function fetchApplication(applicationId: string, signal?: AbortSignal): Promise<Application> {
  return authedRequest<Application>(`${BASE}/${encodeURIComponent(applicationId)}`, { signal });
}

/**
 * Patch the fields the seller changed.
 *
 * Only keys present in `fields` are sent: the API's `whitelist` +
 * `forbidNonWhitelisted` pipe rejects the whole request over one unknown key, and
 * an empty string is meaningful (it clears the column), so `undefined` is the
 * only way to say "leave this alone".
 */
export function updateApplication(
  applicationId: string,
  fields: ApplicationFields,
): Promise<Application> {
  return authedRequest<Application>(`${BASE}/${encodeURIComponent(applicationId)}`, {
    method: "PATCH",
    body: fields,
  });
}

/**
 * Submit or resubmit. `acceptTerms` must be literally `true` — the DTO uses
 * `@Equals(true)`, so an unchecked box is a 400, not a silent no-op.
 *
 * A refusal is an {@link ApiError} whose `details` carry `missing` (field names)
 * and `missingDocuments` (document kinds). Those are the only way the wizard can
 * point at what is absent, so callers must read them rather than showing
 * `error.message` alone.
 */
export function submitApplication(
  applicationId: string,
  input: { acceptTerms: true; note?: string },
): Promise<Application> {
  return authedRequest<Application>(`${BASE}/${encodeURIComponent(applicationId)}/submit`, {
    method: "POST",
    body: input.note ? { acceptTerms: true, note: input.note } : { acceptTerms: true },
  });
}

export function withdrawApplication(applicationId: string, reason?: string): Promise<Application> {
  return authedRequest<Application>(`${BASE}/${encodeURIComponent(applicationId)}/withdraw`, {
    method: "POST",
    body: reason ? { reason } : {},
  });
}

/**
 * Attach a document. Multipart, field name `file`, kind as a text part.
 *
 * Uploading a kind that is already attached replaces it server-side (except
 * `OTHER`, which accumulates), so the UI does not have to delete first.
 */
export function uploadDocument(
  applicationId: string,
  kind: DocumentKind,
  file: File,
): Promise<ApplicationDocument> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file, file.name);
  return authedRequest<ApplicationDocument>(`${BASE}/${encodeURIComponent(applicationId)}/documents`, {
    method: "POST",
    form,
  });
}

export function deleteDocument(
  applicationId: string,
  documentId: string,
): Promise<ApplicationDocument> {
  return authedRequest<ApplicationDocument>(
    `${BASE}/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
}

/**
 * Fetch a document's bytes as an object URL.
 *
 * The download route is authenticated and there are no signed URLs by design, so
 * a bare `<a href>` would arrive without the bearer token and 401. The bytes have
 * to be fetched and wrapped in a blob; the caller owns the URL and must
 * `URL.revokeObjectURL` it.
 *
 * `authedBlob` rather than a hand-rolled `fetch`: this used to read the access
 * token straight out of the session and send it raw, which meant it was the one
 * call in the console that never refreshed. A seller who had had the wizard open
 * for more than fifteen minutes was told "could not open the document" when the
 * document was fine and only their token had expired.
 */
export async function openDocument(
  applicationId: string,
  documentId: string,
): Promise<{ url: string; revoke: () => void }> {
  let blob: Blob;
  try {
    blob = await authedBlob(
      `${BASE}/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/file`,
    );
  } catch (err) {
    // The transport's message for a download is about a request; this is about a
    // document, and a missing one is worth saying plainly. Everything else —
    // 401, 403, offline — keeps the message it came with.
    if (err instanceof ApiError && err.status === 404) {
      throw new ApiError({
        status: 404,
        kind: err.kind,
        message: "That document is no longer available.",
      });
    }
    throw err;
  }
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/**
 * Public category list, used by the shop-type select.
 *
 * `GET /categories` is a catalog read, so it lives with the rest of them in
 * `./products`; re-exported here because the onboarding form asked for it first
 * and one definition of an endpoint is the point.
 */
export { fetchCategories } from "./products";
