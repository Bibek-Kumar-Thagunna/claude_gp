"use client";

import * as React from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/primitives";
import { InlineError, Spinner } from "@/components/states";
import { ApiError } from "@gopasal/api-client";
import { asApiError } from "@/lib/api/client";
import { withdrawApplication } from "@/lib/api/onboarding";
import type { Application } from "@/lib/api/types";

/**
 * Withdrawing, with the confirm step inline.
 *
 * Available for as long as the API allows it — a draft, one waiting in the queue,
 * or one a reviewer has already opened — which is why this is its own component
 * rather than part of the submit panel: those states share the action but nothing
 * else.
 */
export function WithdrawRow({
  app,
  onUpdated,
}: {
  app: Application;
  onUpdated: (next: Application) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await withdrawApplication(app.id));
      setConfirming(false);
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm text-ink-600">
            Withdraw this application? It closes for good — you can start a new one afterwards.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger" size="sm" onClick={() => void withdraw()} disabled={busy}>
            {busy ? <Spinner /> : <XCircle className="h-4 w-4" />}
            Yes, withdraw
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm font-medium text-ink-400 underline hover:text-ink-600"
        >
          Withdraw this application
        </button>
      )}
      {error && <InlineError className="mt-3" message={error.message} />}
    </div>
  );
}
