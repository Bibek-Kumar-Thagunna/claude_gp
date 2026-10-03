"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Logo } from "@gopasal/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Report to your monitoring service here (e.g. Sentry).
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[70vh] place-items-center px-6 py-20">
      <div className="max-w-md text-center">
        <div className="flex justify-center"><Logo variant="mark" height={56} /></div>
        <div className="mx-auto mt-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-ink-900">Something went wrong</h1>
        <p className="mt-3 text-ink-600">
          We hit an unexpected snag while loading this page. Please try again — if it keeps
          happening, our team is already on it.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-ink-400">Reference: {error.digest}</p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button onClick={reset} className="gp-btn gp-btn-primary px-6 py-3">
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/"
            className="gp-btn border border-ink-200 bg-white px-6 py-3 text-ink-800 hover:bg-ink-100"
          >
            <Home className="h-4 w-4" /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
