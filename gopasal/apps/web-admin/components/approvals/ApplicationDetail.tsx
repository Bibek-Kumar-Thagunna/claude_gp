"use client";

import * as React from "react";
import {
  CheckCircle2,
  ShieldX,
  MessageSquareWarning,
  UserCheck,
  Loader2,
  Store,
  Phone,
  Mail,
  MapPin,
  User,
  Landmark,
  History,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  Button,
  KeyValue,
  Avatar,
} from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { Can } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { CoverageMap } from "@/components/CoverageMap";
import { InlineError, InlineNotice, InlineWarning } from "@/components/states";
import { ApiError } from "@gopasal/api-client";
import {
  approveApplication,
  claimApplication,
  fetchApplication,
  rejectApplication,
} from "@/lib/api/onboarding-review";
import { DECIDABLE_STATUSES, type ReviewApplication } from "@/lib/api/types";
import { DocumentList } from "@/components/approvals/DocumentList";
import { RequestChangesDrawer } from "@/components/approvals/RequestChangesDrawer";
import {
  documentLabelOf,
  fieldLabel,
  fullDateTime,
  payoutLabel,
  timelineLabel,
} from "@/lib/onboarding-view";
import { phone as fmtPhone } from "@/lib/format";

/**
 * One application, and every decision that can be made about it.
 *
 * The server is the authority on all four of the things that could be guessed
 * here. Whether a decision is accepted at all is `DECIDABLE_STATUSES`, copied
 * from the transition table; whether approval will go through is `missing` and
 * `missingDocuments`, which are computed server-side; who holds the review is
 * `internal.reviewer`; and the outcome of any action is the full application the
 * mutation returns, which replaces the local copy wholesale rather than being
 * merged field by field.
 *
 * Nothing is applied optimistically. An approval creates a shop and a membership,
 * so a screen that showed success before the server agreed would be inventing the
 * one fact a reviewer must be able to trust.
 */

/** A refused approval, as the API described it. */
type Refusal = { message: string; missing: string[]; missingDocuments: string[] };

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function ApplicationDetail({
  application,
  onChanged,
}: {
  application: ReviewApplication;
  /** Replace the caller's copy with the server's fresh view. */
  onChanged: (next: ReviewApplication) => void;
}) {
  const [busy, setBusy] = React.useState<null | "claim" | "approve" | "reject" | "reload">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refusal, setRefusal] = React.useState<Refusal | null>(null);
  const [pending, setPending] = React.useState<null | "approve" | "reject">(null);
  const [changesOpen, setChangesOpen] = React.useState(false);

  const app = application;
  const decidable = DECIDABLE_STATUSES.includes(app.status);
  const claimable = app.status === "SUBMITTED";
  const reviewer = app.internal.reviewer;

  /* A fresh read, used after a document decision and to recover from a 409. */
  const reload = React.useCallback(async () => {
    setBusy("reload");
    try {
      onChanged(await fetchApplication(app.id));
      setError(null);
      setRefusal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not re-read this application.");
    } finally {
      setBusy(null);
    }
  }, [app.id, onChanged]);

  async function claim() {
    setError(null);
    setBusy("claim");
    try {
      onChanged(await claimApplication(app.id));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // A conflict means somebody else holds it; show them who, don't insist.
        if (err.isConflict) void reload();
      } else {
        setError("Could not pick this up. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function approve(note?: string) {
    setError(null);
    setRefusal(null);
    setBusy("approve");
    try {
      onChanged(await approveApplication(app.id, note ? { note } : {}));
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) {
        setRefusal({
          message: err.message,
          missing: err.list("missing"),
          missingDocuments: err.list("missingDocuments"),
        });
      } else {
        setError(err instanceof ApiError ? err.message : "Could not approve. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function reject(note?: string) {
    if (!note) return;
    setError(null);
    setBusy("reject");
    try {
      onChanged(await rejectApplication(app.id, { note }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null;

  return (
    <>
      <Card className="pb-5">
        <SectionTitle
          title={app.shopName ?? `Unnamed application · ${app.reference}`}
          hint={`${app.reference} · ${app.statusLabel}`}
          action={
            <div className="flex items-center gap-2">
              <StatusBadge value={app.status} />
              <button
                type="button"
                onClick={() => void reload()}
                disabled={working}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-50"
                aria-label="Re-read this application"
              >
                <RefreshCw className={busy === "reload" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </button>
            </div>
          }
        />

        <div className="px-5 pt-4">
          {error && <InlineError message={error} className="mb-3" />}

          {refusal && (
            <InlineWarning message={refusal.message} className="mb-3">
              {refusal.missing.length > 0 && (
                <>
                  <p className="mt-1.5 text-xs font-semibold">Still empty:</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {refusal.missing.map((f) => (
                      <li key={f}>{fieldLabel(f)}</li>
                    ))}
                  </ul>
                </>
              )}
              {refusal.missingDocuments.length > 0 && (
                <>
                  <p className="mt-1.5 text-xs font-semibold">Papers not accepted:</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {refusal.missingDocuments.map((k) => (
                      <li key={k}>{documentLabelOf(k)}</li>
                    ))}
                  </ul>
                </>
              )}
            </InlineWarning>
          )}

          {app.shop && (
            <InlineNotice
              message={`Approved — the shop “${app.shop.name}” now exists and the applicant owns it.`}
              className="mb-3"
            >
              <Button href={`/shops/${app.shop.id}`} variant="outline" size="sm" className="mt-2">
                Open the shop record <ExternalLink className="h-4 w-4" />
              </Button>
            </InlineNotice>
          )}

          {reviewer && (
            <p className="mb-3 flex items-center gap-2 text-xs text-ink-500">
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              Picked up by <span className="font-semibold text-ink-700">
                {reviewer.name ?? "another reviewer"}
              </span>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {claimable && (
              <Can perm="shops.approve">
                <Button variant="outline" size="sm" disabled={working} onClick={() => void claim()}>
                  {busy === "claim" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="h-4 w-4" />
                  )}
                  Pick it up
                </Button>
              </Can>
            )}
            {decidable && (
              <>
                <Can perm="shops.approve">
                  <Button size="sm" disabled={working} onClick={() => setPending("approve")}>
                    {busy === "approve" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Approve &amp; create the shop
                  </Button>
                </Can>
                <Can perm="shops.reject">
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={working}
                    onClick={() => setChangesOpen(true)}
                  >
                    <MessageSquareWarning className="h-4 w-4" /> Request changes
                  </Button>
                </Can>
                <Can perm="shops.reject">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={working}
                    onClick={() => setPending("reject")}
                  >
                    {busy === "reject" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldX className="h-4 w-4" />
                    )}
                    Reject
                  </Button>
                </Can>
              </>
            )}
            {!decidable && !claimable && (
              <p className="text-xs text-ink-500">
                No decision is accepted on a {app.statusLabel} application.
              </p>
            )}
          </div>

          {app.missing.length > 0 && (
            <InlineWarning message="Required details are still empty." className="mt-4">
              <ul className="mt-1.5 list-inside list-disc text-xs">
                {app.missing.map((f) => (
                  <li key={f}>{fieldLabel(f)}</li>
                ))}
              </ul>
            </InlineWarning>
          )}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <SectionTitle
            title={
              <span className="inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-crimson-500" /> The shop
              </span>
            }
            hint="What a customer would see, and where it would deliver"
          />
          <div className="px-5 pt-4">
            {app.lat !== null && app.lng !== null ? (
              <CoverageMap
                lat={app.lat}
                lng={app.lng}
                radiusKm={app.deliveryRadiusKm}
                label={dash(app.area)}
                height={220}
              />
            ) : (
              <InlineWarning message="No map location has been set, so the delivery area cannot be checked yet." />
            )}

            <div className="mt-4 divide-y divide-ink-100">
              <KeyValue label="Name">{dash(app.shopName)}</KeyValue>
              <KeyValue label="Name in Nepali">
                <span className="deva">{dash(app.shopNameNp)}</span>
              </KeyValue>
              <KeyValue label="Shop type">{app.category ? app.category.en : "—"}</KeyValue>
              <KeyValue label="Area">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-ink-400" />
                  {dash(app.area)}
                </span>
              </KeyValue>
              <KeyValue label="Full address">{dash(app.fullAddress)}</KeyValue>
              <KeyValue label="Delivery coverage">{app.deliveryRadiusKm} km</KeyValue>
              <KeyValue label="Opening hours">{dash(app.hours)}</KeyValue>
              <KeyValue label="Who delivers">
                {app.soloMode ? "The owner, personally" : "The shop’s own riders"}
              </KeyValue>
              <KeyValue label="Shop phone">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-ink-400" />
                  {app.contactPhone ? fmtPhone(app.contactPhone) : "—"}
                </span>
              </KeyValue>
              <KeyValue label="Shop email">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-ink-400" />
                  {dash(app.contactEmail)}
                </span>
              </KeyValue>
            </div>

            {app.description && (
              <p className="mt-4 rounded-xl bg-ink-50 px-3.5 py-3 text-sm leading-relaxed text-ink-600">
                {app.description}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="pb-5">
            <SectionTitle
              title={
                <span className="inline-flex items-center gap-2">
                  <User className="h-4 w-4 text-crimson-500" /> Owner &amp; registration
                </span>
              }
              hint="Check each of these against the attached papers"
            />
            <div className="divide-y divide-ink-100 px-5 pt-4">
              <KeyValue label="Owner’s full name">{dash(app.kyc.ownerName)}</KeyValue>
              <KeyValue label="Name in Nepali">
                <span className="deva">{dash(app.kyc.ownerNameNp)}</span>
              </KeyValue>
              <KeyValue label="Citizenship number">
                <span className="font-mono text-xs">{dash(app.kyc.citizenshipNo)}</span>
              </KeyValue>
              <KeyValue label="Registration number">
                <span className="font-mono text-xs">{dash(app.kyc.registrationNo)}</span>
              </KeyValue>
              <KeyValue label="PAN">
                <span className="font-mono text-xs">{dash(app.kyc.panNo)}</span>
              </KeyValue>
              <KeyValue label="VAT">
                <span className="font-mono text-xs">{dash(app.kyc.vatNo)}</span>
              </KeyValue>
            </div>
          </Card>

          <Card className="pb-5">
            <SectionTitle
              title={
                <span className="inline-flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-crimson-500" /> Payout
                </span>
              }
              hint="Where settlements would be sent once the shop trades"
            />
            <div className="divide-y divide-ink-100 px-5 pt-4">
              <KeyValue label="Method">{payoutLabel(app.payout.payoutMethod)}</KeyValue>
              {app.payout.payoutMethod === "BANK" ? (
                <>
                  <KeyValue label="Bank">{dash(app.payout.bankName)}</KeyValue>
                  <KeyValue label="Branch">{dash(app.payout.bankBranch)}</KeyValue>
                  <KeyValue label="Account number">
                    <span className="font-mono text-xs">{dash(app.payout.bankAccountNo)}</span>
                  </KeyValue>
                  <KeyValue label="Account holder">{dash(app.payout.bankAccountName)}</KeyValue>
                </>
              ) : (
                <KeyValue label="Wallet number">
                  <span className="font-mono text-xs">{dash(app.payout.walletNumber)}</span>
                </KeyValue>
              )}
            </div>
            <p className="mt-3 px-5 text-xs text-ink-500">
              The account holder’s name should match the owner’s name above. A mismatch is a reason
              to ask for changes, not to reject.
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <div className="px-5 pt-5">
            <DocumentList
              applicationId={app.id}
              documents={app.documents}
              missingDocuments={app.missingDocuments}
              payoutMethod={app.payout.payoutMethod}
              decidable={decidable}
              onReviewed={reload}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="pb-5">
            <SectionTitle title="Applicant" hint="The account that applied" />
            <div className="px-5 pt-4">
              <div className="flex items-center gap-3">
                <Avatar name={app.applicant.name ?? "Applicant"} tone="crimson" size={42} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900">
                    {app.applicant.name ?? "Name not given"}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {app.applicant.phoneMasked}
                    {app.applicant.email ? ` · ${app.applicant.email}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 divide-y divide-ink-100">
                <KeyValue label="Joined GoPasal">{fullDateTime(app.applicant.joinedAt)}</KeyValue>
                <KeyValue label="Sent for review">
                  {app.review.submittedAt ? fullDateTime(app.review.submittedAt) : "Not yet"}
                </KeyValue>
                <KeyValue label="Times submitted">{app.review.submitCount}</KeyValue>
                <KeyValue label="Terms accepted">
                  {app.terms.acceptedAt
                    ? `${fullDateTime(app.terms.acceptedAt)}${app.terms.version ? ` · ${app.terms.version}` : ""}`
                    : "Not accepted"}
                </KeyValue>
                {app.review.decidedAt && (
                  <KeyValue label="Decided">{fullDateTime(app.review.decidedAt)}</KeyValue>
                )}
              </div>

              {app.review.decisionNote && (
                <div className="mt-4 rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="text-xs font-semibold text-ink-700">Last note to the applicant</p>
                  <p className="mt-1 text-sm text-ink-600">{app.review.decisionNote}</p>
                  {app.review.changesRequested.length > 0 && (
                    <p className="mt-2 text-xs text-ink-500">
                      Asked to change:{" "}
                      {app.review.changesRequested.map((f) => fieldLabel(f)).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {app.internal.reviewerNote && (
                <div className="mt-3 rounded-xl border border-dashed border-ink-200 px-3.5 py-3">
                  <p className="text-xs font-semibold text-ink-700">
                    Internal note · reviewers only
                  </p>
                  <p className="mt-1 text-sm text-ink-600">{app.internal.reviewerNote}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="pb-4">
            <SectionTitle
              title={
                <span className="inline-flex items-center gap-2">
                  <History className="h-4 w-4 text-crimson-500" /> History
                </span>
              }
              hint="Oldest first, exactly as the API recorded it"
            />
            {app.timeline.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-500">Nothing recorded yet.</p>
            ) : (
              <ol className="mt-3 divide-y divide-ink-100">
                {app.timeline.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-ink-800">
                        {timelineLabel(entry.type)}
                      </p>
                      <p className="shrink-0 text-xs text-ink-400">{fullDateTime(entry.at)}</p>
                    </div>
                    {entry.message && (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{entry.message}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pending === "approve"}
        onCancel={() => setPending(null)}
        onConfirm={(note) => {
          setPending(null);
          void approve(note);
        }}
        title={`Approve ${app.shopName ?? "this application"}?`}
        description="This creates the shop, makes the applicant its Owner and lets them start listing. The shop is not visible to customers until they open it themselves."
        confirmLabel="Approve"
        reasonLabel="Note to the applicant (optional)"
      />

      <ConfirmDialog
        open={pending === "reject"}
        onCancel={() => setPending(null)}
        onConfirm={(note) => {
          setPending(null);
          void reject(note);
        }}
        title={`Reject ${app.shopName ?? "this application"}?`}
        description="The applicant is told their application was not accepted and is shown your reason. If they only need to fix something, ask for changes instead — that keeps the application open."
        confirmLabel="Reject the application"
        destructive
        reasonLabel="Reason shown to the applicant"
        reasonRequired
      />

      <RequestChangesDrawer
        open={changesOpen}
        onClose={() => setChangesOpen(false)}
        application={app}
        onDone={onChanged}
      />
    </>
  );
}

export default ApplicationDetail;
