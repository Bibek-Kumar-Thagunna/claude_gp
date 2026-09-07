import * as React from "react";
import { CheckCircle2, Clock, FileEdit, MessageSquareWarning, XCircle } from "lucide-react";
import { Badge, Card } from "@/components/primitives";
import type { Application } from "@/lib/api/types";
import { fieldLabel, fullDateTime, statusPresentation } from "@/lib/onboarding-view";

/**
 * The application's real state, straight from the API.
 *
 * `status`, `statusLabel`, the reviewer's note and the field list in
 * `review.changesRequested` are all server-owned; this component chooses an icon
 * and a tone for them and otherwise repeats what it was told. There is no local
 * notion of progress, and no "almost there" — a seller reading this should see
 * exactly what a reviewer sees.
 */

const ICONS: Record<Application["status"], React.ComponentType<{ className?: string }>> = {
  DRAFT: FileEdit,
  SUBMITTED: Clock,
  UNDER_REVIEW: Clock,
  CHANGES_REQUESTED: MessageSquareWarning,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  WITHDRAWN: XCircle,
};

export function StatusRibbon({ app }: { app: Application }) {
  const view = statusPresentation(app.status);
  const Icon = ICONS[app.status];
  const decidedAt = app.review.decidedAt;
  const submittedAt = app.review.submittedAt;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-ink-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-ink-900">{view.title}</h2>
              <Badge tone={view.tone} dot>
                {app.statusLabel}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">{view.description}</p>
          </div>
        </div>
        <dl className="shrink-0 text-xs text-ink-400 sm:text-right">
          <dt className="sr-only">Reference</dt>
          <dd className="font-mono font-semibold text-ink-600">{app.reference}</dd>
          {submittedAt && (
            <>
              <dt className="mt-1.5 sr-only">Sent</dt>
              <dd>Sent {fullDateTime(submittedAt)}</dd>
            </>
          )}
          {decidedAt && (
            <>
              <dt className="sr-only">Decided</dt>
              <dd>Decided {fullDateTime(decidedAt)}</dd>
            </>
          )}
          {app.review.submitCount > 1 && <dd>Sent {app.review.submitCount} times</dd>}
        </dl>
      </div>

      {app.review.note && (
        <div className="border-b border-ink-100 bg-ink-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Note from the GoPasal team
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm text-ink-800">{app.review.note}</p>
        </div>
      )}

      {app.review.changesRequested.length > 0 && (
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            They asked you to check
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {app.review.changesRequested.map((name) => (
              <li key={name}>
                <Badge tone="marigold">{fieldLabel(name)}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
