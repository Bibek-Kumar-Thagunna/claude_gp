"use client";

import * as React from "react";
import { Send, Loader2, AlertTriangle } from "lucide-react";
import { Button, Field, inputCls } from "@/components/primitives";
import { Drawer } from "@/components/Drawer";
import { InlineError, InlineNotice } from "@/components/states";
import { ApiError } from "@gopasal/api-client";
import { requestChanges } from "@/lib/api/onboarding-review";
import type { ReviewApplication } from "@/lib/api/types";
import {
  EDITABLE_FIELDS,
  FIELD_GROUPS,
  fieldLabel,
  type EditableField,
} from "@/lib/onboarding-view";

/**
 * Handing an application back with instructions.
 *
 * This is the one decision that is not a yes or a no, so it gets a drawer rather
 * than a confirm dialog: it carries a note the applicant reads verbatim, a list
 * of the fields they are being asked to change, and an internal note that never
 * leaves this console.
 *
 * The field picker is a picker on purpose. `fields` is validated server-side with
 * `@IsIn(EDITABLE_FIELDS, { each: true })`, so anything typed freehand would be a
 * 400; offering only the real field names means the request cannot be malformed.
 * The initial ticks come from the server's own `missing` list — it already knows
 * what is empty, and re-deriving that here would only be a second opinion that
 * could disagree.
 */

const EDITABLE = new Set<string>(EDITABLE_FIELDS);

export function RequestChangesDrawer({
  open,
  onClose,
  application,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  application: ReviewApplication;
  /** Given the application as the server returns it after the change request. */
  onDone: (next: ReviewApplication) => void;
}) {
  const [note, setNote] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");
  const [fields, setFields] = React.useState<Set<EditableField>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* Reopening starts clean, seeded from what the server says is outstanding. */
  React.useEffect(() => {
    if (!open) return;
    const seeded = new Set<EditableField>(
      application.missing.filter((f): f is EditableField => EDITABLE.has(f)),
    );
    if (application.missingDocuments.length > 0) seeded.add("documents");
    setFields(seeded);
    setNote("");
    setInternalNote("");
    setError(null);
    setBusy(false);
  }, [open, application.missing, application.missingDocuments]);

  const toggle = (field: EditableField) => {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const blocked = note.trim().length < 4 || note.length > 1000 || busy;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const next = await requestChanges(application.id, {
        note: note.trim(),
        fields: Array.from(fields),
        internalNote,
      });
      onDone(next);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not send the change request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Ask for changes"
      subtitle={`${application.shopName ?? "Unnamed shop"} · ${application.reference}`}
      width={560}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={blocked} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send it back
          </Button>
        </>
      }
    >
      {error && <InlineError message={error} className="mb-4" />}

      <InlineNotice message="The applicant can edit their application again as soon as you send this, and the ticked fields are highlighted for them. Nothing is rejected — the application stays open." />

      <Field
        label="What they need to fix"
        required
        hint={`Shown to the applicant word for word. ${note.trim().length}/1000`}
        className="mt-5"
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={1000}
          className={`${inputCls} resize-none`}
          placeholder="The citizenship photo is too dark to read the number. Please retake it in daylight."
        />
      </Field>

      <div className="mt-5">
        <p className="text-sm font-semibold text-ink-800">
          Which parts to change{" "}
          <span className="font-normal text-ink-500">
            ({fields.size} {fields.size === 1 ? "field" : "fields"})
          </span>
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Optional. Ticked fields are the ones the applicant is pointed at first.
        </p>

        <div className="mt-3 space-y-4">
          {FIELD_GROUPS.map((group) => (
            <div key={group.section}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                {group.section}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {group.fields.map((field) => {
                  const on = fields.has(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(field)}
                      className={
                        on
                          ? "rounded-full bg-crimson-500 px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50"
                      }
                    >
                      {fieldLabel(field)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Field
        label="Internal note"
        hint="Reviewers only. The applicant never sees this."
        className="mt-5"
      >
        <textarea
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          rows={2}
          maxLength={1000}
          className={`${inputCls} resize-none`}
          placeholder="Rang three times, no answer on the shop number."
        />
      </Field>

      {application.missing.length === 0 && application.missingDocuments.length === 0 && (
        <p className="mt-5 flex items-start gap-2 text-xs text-ink-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Nothing is technically missing on this application — say clearly what needs to change so
          the applicant is not left guessing.
        </p>
      )}
    </Drawer>
  );
}

export default RequestChangesDrawer;
