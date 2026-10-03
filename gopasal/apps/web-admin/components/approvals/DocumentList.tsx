"use client";

import * as React from "react";
import {
  FileCheck2,
  FileX2,
  FileClock,
  Eye,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/primitives";
import { Can } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { InlineError, InlineWarning } from "@/components/states";
import { ApiError } from "@gopasal/api-client";
import { openDocument, reviewDocument } from "@/lib/api/onboarding-review";
import type { ApplicationDocument, DocumentKind } from "@/lib/api/types";
import {
  documentLabel,
  formatBytes,
  fullDateTime,
  requiredDocumentKinds,
} from "@/lib/onboarding-view";
import type { PayoutMethod } from "@/lib/api/types";

/**
 * The papers, and the two decisions a reviewer can make about each one.
 *
 * Three things here are deliberate. Opening a file goes through `fetch` with the
 * bearer token and a blob URL, because the download route is authenticated and
 * there are no signed URLs — a plain `<a href>` would 401. Rejecting one needs a
 * note, because the applicant is shown it and has to act on it. And after any
 * decision the *application* is re-read by the parent rather than patched here:
 * `missingDocuments` is the server's answer and a rejected file changes it.
 */

const STATE_STYLE: Record<
  ApplicationDocument["review"],
  { box: string; icon: typeof FileCheck2; label: string }
> = {
  ACCEPTED: { box: "bg-[#EAF7EF] text-[#0B7E58]", icon: FileCheck2, label: "Accepted" },
  REJECTED: { box: "bg-red-50 text-[#c02636]", icon: FileX2, label: "Not accepted" },
  PENDING: { box: "bg-[#FFF3DF] text-[#8a5a00]", icon: FileClock, label: "Not checked yet" },
};

export function DocumentList({
  applicationId,
  documents,
  missingDocuments,
  approvalMissingDocuments,
  payoutMethod,
  vatNo,
  categorySlug,
  decidable,
  onReviewed,
}: {
  applicationId: string;
  documents: ApplicationDocument[];
  /** Server-computed: required kinds that are absent *or* rejected. */
  missingDocuments: DocumentKind[];
  /** Server-computed approval gate: absent, rejected, or still pending review. */
  approvalMissingDocuments: DocumentKind[];
  payoutMethod: PayoutMethod | null;
  vatNo: string | null;
  categorySlug: string | null;
  /** Whether the application is in a status where decisions are accepted. */
  decidable: boolean;
  /** Called after a decision lands, so the parent can re-read the application. */
  onReviewed: () => void | Promise<void>;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<ApplicationDocument | null>(null);

  /** Blob URLs handed to the browser, revoked when this panel goes away. */
  const opened = React.useRef<(() => void)[]>([]);
  React.useEffect(
    () => () => {
      for (const revoke of opened.current) revoke();
      opened.current = [];
    },
    [],
  );

  const required = requiredDocumentKinds(payoutMethod, vatNo, categorySlug);

  async function open(doc: ApplicationDocument) {
    setError(null);
    setBusyId(doc.id);
    try {
      const { url, revoke } = await openDocument(applicationId, doc.id);
      opened.current.push(revoke);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open that document.");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(doc: ApplicationDocument, decision: "ACCEPTED" | "REJECTED", note?: string) {
    setError(null);
    setBusyId(doc.id);
    try {
      await reviewDocument(applicationId, doc.id, note ? { decision, note } : { decision });
      await onReviewed();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not record that decision. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const absent = missingDocuments.filter((k) => !documents.some((d) => d.kind === k));
  const pendingReview = approvalMissingDocuments.filter((kind) => !missingDocuments.includes(kind));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-ink-900">Papers</p>
        <p className="text-xs text-ink-500">
          {documents.length} attached · {required.length} required
        </p>
      </div>

      {error && <InlineError message={error} className="mt-3" />}

      {missingDocuments.length > 0 && (
        <InlineWarning
          message={
            absent.length === missingDocuments.length
              ? "Required papers are missing."
              : "Required papers are missing or have been turned down."
          }
          className="mt-3"
        >
          <ul className="mt-1.5 list-inside list-disc text-xs">
            {missingDocuments.map((kind) => (
              <li key={kind}>{documentLabel(kind)}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">
            Approval is refused by the API until these are attached and accepted. Use “Request
            changes” to ask for them.
          </p>
        </InlineWarning>
      )}

      {pendingReview.length > 0 && (
        <InlineWarning message="Required papers are attached but still need review." className="mt-3">
          <ul className="mt-1.5 list-inside list-disc text-xs">
            {pendingReview.map((kind) => (
              <li key={kind}>{documentLabel(kind)}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">
            Open each file and accept it before approving the shop. The API blocks approval until
            every required paper has an explicit acceptance.
          </p>
        </InlineWarning>
      )}

      {documents.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-ink-200 px-3.5 py-6 text-center text-sm text-ink-500">
          Nothing attached yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {documents.map((doc) => {
            const style = STATE_STYLE[doc.review];
            const Icon = style.icon;
            const busy = busyId === doc.id;
            const isRequired = required.includes(doc.kind);
            return (
              <li key={doc.id} className="rounded-xl border border-ink-100 px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.box}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {documentLabel(doc.kind)}
                      {isRequired && <span className="ml-1 text-crimson-600">*</span>}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {[
                        style.label,
                        doc.fileName ?? "file name unknown",
                        formatBytes(doc.sizeBytes),
                        fullDateTime(doc.uploadedAt),
                      ].join(" · ")}
                    </p>
                    {doc.reviewNote && (
                      <p className="mt-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600">
                        <span className="font-semibold">Note to the applicant:</span>{" "}
                        {doc.reviewNote}
                      </p>
                    )}
                  </div>
                  {busy && <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-ink-400" />}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void open(doc)}>
                    <Eye className="h-4 w-4" /> Open
                  </Button>
                  {decidable && (
                    <Can perm="shops.approve">
                      {doc.review !== "ACCEPTED" && (
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={busy}
                          onClick={() => void decide(doc, "ACCEPTED")}
                        >
                          <Check className="h-4 w-4" /> Accept
                        </Button>
                      )}
                      {doc.review !== "REJECTED" && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={() => setRejecting(doc)}
                        >
                          <X className="h-4 w-4" /> Turn down
                        </Button>
                      )}
                    </Can>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!decidable && documents.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This application is not awaiting a decision, so its papers are read-only.
        </p>
      )}

      <ConfirmDialog
        open={rejecting !== null}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => {
          const doc = rejecting;
          setRejecting(null);
          if (doc) void decide(doc, "REJECTED", reason);
        }}
        title={rejecting ? `Turn down the ${documentLabel(rejecting.kind)}?` : "Turn down document"}
        description="The applicant is shown your note and can upload a replacement. Until they do, this paper does not count towards the required set."
        confirmLabel="Turn it down"
        destructive
        reasonLabel="What is wrong with it (shown to the applicant)"
        reasonRequired
      />
    </div>
  );
}

export default DocumentList;
