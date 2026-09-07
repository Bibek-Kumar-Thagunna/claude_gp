"use client";

import * as React from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surfaced in the browser console; in production this goes to the API's
    // error sink via NEXT_PUBLIC_ERROR_SINK_URL.
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="gp-panel mx-auto max-w-lg px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[#c02636]">
        <AlertOctagon className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-ink-900">This screen failed to load</h1>
      <p className="mt-2 text-sm text-ink-600">
        Nothing was changed on the platform. Retry, and if it keeps happening send the reference below
        to engineering.
      </p>
      {error.digest && (
        <p className="mt-3 inline-block rounded-lg bg-ink-100 px-2.5 py-1 font-mono text-xs text-ink-600">
          ref {error.digest}
        </p>
      )}
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="gp-btn gp-btn-primary px-5 py-2.5 text-sm">
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link
          href="/dashboard"
          className="gp-btn border border-ink-200 bg-white px-5 py-2.5 text-sm text-ink-800 hover:bg-ink-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
