"use client";

import * as React from "react";
import { AlertCircle, Send } from "lucide-react";
import { Button, Card } from "@/components/primitives";
import { InlineError, InlineNotice, Spinner } from "@/components/states";
import { CheckField } from "./fields";
import { WithdrawRow } from "./WithdrawRow";
import { ApiError } from "@gopasal/api-client";
import { asApiError } from "@/lib/api/client";
import { submitApplication } from "@/lib/api/onboarding";
import type { Application, DocumentKind } from "@/lib/api/types";
import { documentLabel, fieldLabel } from "@/lib/onboarding-view";

/**
 * Send the application in — and the one place the server's refusal is shown in
 * full.
 *
 * A refused submit is a 400 carrying `missing` (field names) and
 * `missingDocuments` (document kinds). Both are listed here by name, because "you
 * are missing something" would leave a seller hunting through four sections. The
 * lists on `app` say the same thing before the attempt; the thrown ones are what
 * the server said at the moment it refused, and they win.
 */

const TERMS_URL = "https://gopasal.com/legal/terms";

export function SubmitPanel({
  app,
  unsavedChanges,
  onUpdated,
}: {
  app: Application;
  unsavedChanges: boolean;
  onUpdated: (next: Application) => void;
}) {
  const [accepted, setAccepted] = React.useState(app.terms.acceptedAt !== null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  // What the server said last, in preference to what it said when the page loaded.
  const missingFields = error?.list("missing") ?? app.missing;
  const missingDocs: DocumentKind[] = error
    ? (error.list("missingDocuments") as DocumentKind[])
    : app.missingDocuments;
  const resubmit = app.status === "CHANGES_REQUESTED";
  const blocked = unsavedChanges || !accepted;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      const next = await submitApplication(
        app.id,
        trimmed ? { acceptTerms: true, note: trimmed } : { acceptTerms: true },
      );
      setNote("");
      onUpdated(next);
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-ink-900">
          {resubmit ? "Send your changes back" : "Send for review"}
        </h2>
        {/*
          No promise of a text message. Every onboarding event — submitted, under
          review, changes requested, approved, rejected, withdrawn — is written by
          `NotificationEventsListener` as an **in-app** `Notification` row (the
          service defaults `channel` to `'inapp'` and nothing in the API ever
          passes `'sms'`). SMS is wired for sign-in codes only. The seller console's
          notification bell lives inside the shop shell, which an applicant without
          an approved shop cannot reach yet, so the honest instruction is to come
          back to this page.
        */}
        <p className="mt-1 text-sm text-ink-500">
          A member of the GoPasal team checks every application by hand. Their answer appears on this
          page — come back here to see it. We will not text you about it.
        </p>
      </div>

      {(missingFields.length > 0 || missingDocs.length > 0) && (
        <div className="rounded-xl border border-[#f0d9a8] bg-[#FFF8EC] p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[#8a5a00]">
            <AlertCircle className="h-4 w-4" aria-hidden />
            Still needed before this can be sent
          </p>
          {missingFields.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-[#8a5a00]">
              {missingFields.map((name) => (
                <li key={name}>{fieldLabel(name)}</li>
              ))}
            </ul>
          )}
          {missingDocs.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-[#8a5a00]">
              {missingDocs.map((kind) => (
                <li key={kind}>{documentLabel(kind)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-700">
          Anything you want the reviewer to know
        </span>
        <textarea
          value={note}
          rows={3}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            resubmit
              ? "e.g. I have replaced the citizenship photo with a clearer one."
              : "Optional."
          }
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-crimson-300"
        />
      </label>

      <CheckField
        id="acceptTerms"
        checked={accepted}
        onChange={setAccepted}
        label={
          <>
            I accept the{" "}
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-crimson-600 underline"
            >
              GoPasal seller terms
            </a>
            , and confirm the details and documents above are mine and are correct.
          </>
        }
        hint={
          app.terms.acceptedAt
            ? `Accepted${app.terms.version ? ` (version ${app.terms.version})` : ""}. Confirm again each time you send this in.`
            : undefined
        }
      />

      {error && !error.isValidation && (
        <InlineError message={error.message}>
          {error.offline && <p className="mt-1 text-xs">Nothing was sent. Try again when you are back online.</p>}
        </InlineError>
      )}
      {error?.isValidation && missingFields.length === 0 && missingDocs.length === 0 && (
        <InlineError message={error.message} />
      )}
      {unsavedChanges && (
        /* "Save or undo" rather than "Save": a change the API cannot accept — a
           blank shop name, an emptied coordinate — is unsendable, so the form
           disables Save and offers Undo instead. Telling the seller only to save
           would be an instruction they cannot follow. */
        <InlineNotice message="Save or undo your changes above first — the reviewer sees what is saved, not what is on this screen." />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void send()} disabled={blocked || busy}>
          {busy ? <Spinner className="text-white" /> : <Send className="h-4 w-4" />}
          {busy ? "Sending…" : resubmit ? "Send changes" : "Send for review"}
        </Button>
        {!accepted && <p className="text-xs text-ink-400">Accept the terms to continue.</p>}
      </div>

      <div className="border-t border-ink-100 pt-4">
        <WithdrawRow app={app} onUpdated={onUpdated} />
      </div>
    </Card>
  );
}
