"use client";

import * as React from "react";
import { FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { Badge, Card } from "@/components/primitives";
import { InlineError, Spinner } from "@/components/states";
import { SectionTitle } from "./fields";
import { asApiError } from "@/lib/api/client";
import { deleteDocument, openDocument, uploadDocument } from "@/lib/api/onboarding";
import type { Application, ApplicationDocument, DocumentKind } from "@/lib/api/types";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_UPLOAD_TYPES,
  MAX_DOCUMENT_BYTES,
  OPTIONAL_DOCUMENT_KINDS,
  documentLabel,
  documentSlot,
  formatBytes,
  fullDateTime,
  requiredDocumentKinds,
} from "@/lib/onboarding-view";

/**
 * The documents panel: one slot per kind the API knows about.
 *
 * The required slots come from `requiredDocuments()` on the server, mirrored so a
 * seller can see the whole job before starting it rather than discovering the
 * fourth requirement when submit is refused. The type and size checks here are
 * the same pre-check: the server sniffs magic bytes and will refuse a renamed
 * file regardless of what this code allowed through.
 *
 * A document a reviewer REJECTED is shown as rejected *and* still counts as
 * missing, because that is what the API does — otherwise the same blurred photo
 * could be resubmitted forever.
 */

function reviewBadge(doc: ApplicationDocument) {
  if (doc.review === "ACCEPTED") return <Badge tone="green">Accepted</Badge>;
  if (doc.review === "REJECTED") return <Badge tone="red">Rejected — replace this</Badge>;
  return <Badge tone="ink">Waiting to be checked</Badge>;
}

export function DocumentsPanel({
  app,
  onChanged,
}: {
  app: Application;
  /** Re-read the application: only the server knows what is still missing. */
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ slot: string; message: string } | null>(null);
  const canEdit = app.canEdit;

  const required = requiredDocumentKinds(app.payoutMethod);
  const missing = new Set<string>(app.missingDocuments);
  const byKind = new Map<DocumentKind, ApplicationDocument[]>();
  for (const doc of app.documents) {
    const list = byKind.get(doc.kind);
    if (list) list.push(doc);
    else byKind.set(doc.kind, [doc]);
  }

  async function upload(kind: DocumentKind, file: File) {
    setError(null);
    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      setError({ slot: kind, message: "That file type is not accepted. Use a JPG, PNG, WEBP or PDF." });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError({
        slot: kind,
        message: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)} — take the photo again at a smaller size.`,
      });
      return;
    }
    setBusy(kind);
    try {
      await uploadDocument(app.id, kind, file);
      await onChanged();
    } catch (err) {
      setError({ slot: kind, message: asApiError(err).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(doc: ApplicationDocument) {
    setError(null);
    setBusy(doc.id);
    try {
      await deleteDocument(app.id, doc.id);
      await onChanged();
    } catch (err) {
      setError({ slot: doc.kind, message: asApiError(err).message });
    } finally {
      setBusy(null);
    }
  }

  async function view(doc: ApplicationDocument) {
    setError(null);
    setBusy(doc.id);
    try {
      const { url, revoke } = await openDocument(app.id, doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
      // The new tab needs the blob to still exist when it loads, so the URL is
      // released a little later rather than immediately.
      window.setTimeout(revoke, 60_000);
    } catch (err) {
      setError({ slot: doc.kind, message: asApiError(err).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <SectionTitle
        icon={<Paperclip className="h-4 w-4" />}
        title="Documents"
        hint="Photos or PDFs, up to 10 MB each. Only the GoPasal review team can open them."
      />
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Needed before you can send this in
        </p>
        {required.map((kind) => (
          <Slot
            key={kind}
            slot={documentSlot(kind)}
            docs={byKind.get(kind) ?? []}
            required
            flagged={missing.has(kind)}
            canEdit={canEdit}
            busy={busy}
            error={error?.slot === kind ? error.message : null}
            onPick={(file) => void upload(kind, file)}
            onRemove={(doc) => void remove(doc)}
            onView={(doc) => void view(doc)}
          />
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Helpful, but not required
        </p>
        {OPTIONAL_DOCUMENT_KINDS.map((kind) => (
          <Slot
            key={kind}
            slot={documentSlot(kind)}
            docs={byKind.get(kind) ?? []}
            required={false}
            flagged={false}
            canEdit={canEdit}
            busy={busy}
            error={error?.slot === kind ? error.message : null}
            onPick={(file) => void upload(kind, file)}
            onRemove={(doc) => void remove(doc)}
            onView={(doc) => void view(doc)}
            allowMultiple={kind === "OTHER"}
          />
        ))}
      </div>
    </Card>
  );
}

function Slot({
  slot,
  docs,
  required,
  flagged,
  canEdit,
  busy,
  error,
  onPick,
  onRemove,
  onView,
  allowMultiple = false,
}: {
  slot: ReturnType<typeof documentSlot>;
  docs: ApplicationDocument[];
  required: boolean;
  flagged: boolean;
  canEdit: boolean;
  busy: string | null;
  error: string | null;
  onPick: (file: File) => void;
  onRemove: (doc: ApplicationDocument) => void;
  onView: (doc: ApplicationDocument) => void;
  allowMultiple?: boolean;
}) {
  const uploading = busy === slot.kind;
  // Re-uploading a single-instance kind replaces it server-side, so there is no
  // delete-then-upload dance: while the application is editable, a new file is
  // always allowed.
  const replacing = docs.length > 0 && !allowMultiple;

  return (
    <div
      className={
        flagged
          ? "rounded-xl border border-red-200 bg-red-50/40 p-4"
          : "rounded-xl border border-ink-100 p-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
            {slot.label}
            {required && (
              <span className="text-crimson-600" aria-label="required">
                *
              </span>
            )}
          </p>
          <p className="mt-0.5 max-w-lg text-xs text-ink-400">{slot.hint}</p>
        </div>
        {docs.length === 0 && required && <Badge tone="marigold">Not attached yet</Badge>}
      </div>

      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-ink-50/70 px-3 py-2.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-800">
                  {doc.fileName ?? documentLabel(doc.kind)}
                </p>
                <p className="text-xs text-ink-400">
                  {formatBytes(doc.sizeBytes)} · attached {fullDateTime(doc.uploadedAt)}
                </p>
                {doc.reviewNote && (
                  <p className="mt-1 text-xs text-[#c02636]">Reviewer: {doc.reviewNote}</p>
                )}
              </div>
              {reviewBadge(doc)}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onView(doc)}
                  disabled={busy === doc.id}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-white disabled:opacity-50"
                >
                  {busy === doc.id ? <Spinner className="h-3.5 w-3.5" /> : "View"}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onRemove(doc)}
                    disabled={busy === doc.id}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#c02636] hover:bg-white disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50">
          {uploading ? <Spinner /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading…" : replacing ? "Replace" : allowMultiple && docs.length > 0 ? "Add another" : "Choose a file"}
          <input
            type="file"
            className="sr-only"
            accept={ACCEPT_ATTRIBUTE}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so choosing the same file twice still fires a change.
              e.target.value = "";
              if (file) onPick(file);
            }}
          />
        </label>
      )}

      {error && <InlineError className="mt-3" message={error} />}
    </div>
  );
}
