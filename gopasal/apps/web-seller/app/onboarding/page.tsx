"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Rocket, Store } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/primitives";
import { ErrorPanel, InlineError, InlineNotice, LoadingPanel, Spinner } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { ApplicationForm } from "@/components/onboarding/ApplicationForm";
import { ApplicationSummary } from "@/components/onboarding/ApplicationSummary";
import { DocumentsPanel } from "@/components/onboarding/DocumentsPanel";
import { StatusRibbon } from "@/components/onboarding/StatusRibbon";
import { SubmitPanel } from "@/components/onboarding/SubmitPanel";
import { Timeline } from "@/components/onboarding/Timeline";
import { WithdrawRow } from "@/components/onboarding/WithdrawRow";
import { ApiError } from "@gopasal/api-client";
import { asApiError } from "@/lib/api/client";
import {
  createApplication,
  fetchApplication,
  fetchCategories,
  listApplications,
  updateApplication,
} from "@/lib/api/onboarding";
import type { Application, ApplicationFields, Category } from "@/lib/api/types";
import { fieldLabel } from "@/lib/onboarding-view";

/**
 * The seller's shop application, end to end, on the real API.
 *
 * One screen rather than a stepper: the API has no notion of a step, it has a set
 * of fields and a list of what is still missing, and pretending otherwise would
 * mean inventing a progress model the server would then contradict.
 *
 * The whole list is loaded rather than `/current`, because `/current` answers only
 * for the *open* application — a rejected or withdrawn one is exactly what a
 * returning seller needs to see, along with the reason.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { reload } = useAuth();

  const [app, setApp] = React.useState<Application | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = React.useState<ApiError | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState<ApiError | null>(null);
  const [unsaved, setUnsaved] = React.useState(false);
  const [opening, setOpening] = React.useState(false);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const all = await listApplications(signal);
      // The open one if there is one; otherwise the most recent, so a decision
      // that has already been made is still on screen.
      setApp(all.find((a) => a.isOpen) ?? all[0] ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(asApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = React.useCallback(async (signal?: AbortSignal) => {
    setCategoriesError(null);
    try {
      setCategories(await fetchCategories(signal));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCategoriesError(asApiError(err));
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    void loadCategories(controller.signal);
    return () => controller.abort();
  }, [load, loadCategories]);

  /** Re-read the one application, e.g. after a document changed. */
  const refresh = React.useCallback(async () => {
    if (!app) return;
    setApp(await fetchApplication(app.id));
  }, [app]);

  const save = React.useCallback(
    async (fields: ApplicationFields) => {
      if (!app) return;
      setApp(await updateApplication(app.id, fields));
    },
    [app],
  );

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      setApp(await createApplication());
    } catch (err) {
      setStartError(asApiError(err));
    } finally {
      setStarting(false);
    }
  }

  /** Approved: the shop exists, so `/auth/me` has to be re-read before leaving. */
  async function openDashboard() {
    setOpening(true);
    await reload();
    router.push("/dashboard");
  }

  const problemFor = React.useCallback(
    (name: string): string | null => {
      if (!app) return null;
      if (app.review.changesRequested.includes(name)) {
        return `Our team asked you to check ${fieldLabel(name).toLowerCase()}.`;
      }
      if (app.missing.includes(name)) return "Needed before you can send this in.";
      return null;
    },
    [app],
  );

  return (
    <>
      <PageHeader
        icon={<Store className="h-5 w-5" />}
        title="Register your shop"
        subtitle="Tell us about your shop and attach your documents. Our team checks each application by hand."
      />
      {loading ? (
        <LoadingPanel label="Opening your application…" />
      ) : error ? (
        <ErrorPanel
          title="Could not load your application"
          message={error.message}
          offline={error.offline}
          onRetry={() => void load()}
        />
      ) : !app ? (
        <StartCard starting={starting} error={startError} onStart={() => void start()} />
      ) : (
        <div className="space-y-4">
          <StatusRibbon app={app} />

          {app.status === "APPROVED" && (
            <Card className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF7EF] text-[#0B7E58]">
                  <Rocket className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-ink-900">
                    {app.shop?.name ?? "Your shop"} is on GoPasal
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Your dashboard is open. Before customers can discover the shop, add a verified
                    shop pin and publish at least one product that can be ordered.
                  </p>
                </div>
              </div>
              <Button onClick={() => void openDashboard()} disabled={opening}>
                {opening ? <Spinner className="text-white" /> : null}
                {opening ? "Opening…" : "Open my dashboard"}
                {!opening && <ArrowRight className="h-4 w-4" />}
              </Button>
            </Card>
          )}

          {(app.status === "REJECTED" || app.status === "WITHDRAWN") && (
            <Card className="space-y-4 p-5">
              <p className="text-sm text-ink-600">
                You can apply again with corrected details. Starting a new application does not delete
                this one.
              </p>
              {startError && <InlineError message={startError.message} />}
              <Button onClick={() => void start()} disabled={starting}>
                {starting ? <Spinner className="text-white" /> : null}
                {starting ? "Starting…" : "Start a new application"}
              </Button>
            </Card>
          )}

          {app.canEdit ? (
            <>
              {categoriesError && (
                <InlineError message={`Shop types could not be loaded: ${categoriesError.message}`}>
                  <button
                    type="button"
                    onClick={() => void loadCategories()}
                    className="mt-1 text-xs font-semibold underline"
                  >
                    Try again
                  </button>
                </InlineError>
              )}
              <ApplicationForm
                app={app}
                categories={categories}
                problemFor={problemFor}
                onSave={save}
                onDirtyChange={setUnsaved}
                onLocationCaptured={refresh}
              />
              <DocumentsPanel app={app} onChanged={refresh} />
              <SubmitPanel app={app} unsavedChanges={unsaved} onUpdated={setApp} />
            </>
          ) : (
            <>
              {app.isOpen && (
                <InlineNotice message="While your application is with our team it cannot be edited. If anything needs changing, they will hand it back to you here." />
              )}
              <ApplicationSummary app={app} />
              <DocumentsPanel app={app} onChanged={refresh} />
              {app.isOpen && (
                <Card className="p-5">
                  <WithdrawRow app={app} onUpdated={setApp} />
                </Card>
              )}
            </>
          )}

          <Timeline entries={app.timeline} />
        </div>
      )}
    </>
  );
}

/**
 * The very first visit. Creating a draft is a deliberate act rather than a
 * side-effect of loading the page — nobody should acquire a database row by
 * looking at a screen.
 */
function StartCard({
  starting,
  error,
  onStart,
}: {
  starting: boolean;
  error: ApiError | null;
  onStart: () => void;
}) {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
          <Store className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Let&apos;s get your shop listed</h2>
          <p className="mt-1 text-sm text-ink-500">
            It takes about ten minutes. You can save and come back at any point — nothing is sent to
            our team until you say so.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Have these ready
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-600">
          <li>Your citizenship certificate — a photo of the front and the back</li>
          <li>Your current business registration certificate and registration number</li>
          <li>Your business PAN certificate and PAN number</li>
          <li>A regulator licence if you run a regulated shop, such as a pharmacy</li>
          <li>A photo of your shopfront</li>
          <li>Your bank account details, or your eSewa or Khalti number</li>
        </ul>
      </div>

      {error && <InlineError message={error.message} />}

      <Button onClick={onStart} disabled={starting} size="lg">
        {starting ? <Spinner className="text-white" /> : null}
        {starting ? "Starting…" : "Start my application"}
        {!starting && <ArrowRight className="h-4 w-4" />}
      </Button>
    </Card>
  );
}
