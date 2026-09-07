import Link from "next/link";
import { WifiOff, RotateCcw } from "lucide-react";
import { Logo } from "@gopasal/ui";

export const metadata = { title: "You’re offline" };

/**
 * The offline fallback screen.
 *
 * Two honest notes, because this page is easy to over-promise on:
 *
 * - **Nothing is queued while offline.** This app registers no service worker
 *   (`public/` holds icons only), keeps no IndexedDB store and has no request
 *   queue, so a save attempted without a connection simply fails and must be
 *   retried by hand. The copy here used to read "your work is safe and new orders
 *   will sync as soon as you reconnect", which described a background-sync
 *   mechanism GoPasal does not have.
 * - **Nothing routes here automatically.** With no service worker there is no
 *   navigation fallback, so a seller reaches `/offline` only by opening the URL.
 *   The route is kept as the target for a future service worker rather than
 *   deleted, but it must not be described as something the console shows on its
 *   own.
 */
export default function OfflinePage() {
  return (
    <div className="grid min-h-screen place-items-center px-6 py-20">
      <div className="max-w-md text-center">
        <Logo variant="mark" height={56} className="mx-auto" />
        <div className="mx-auto mt-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-ink-700">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-ink-900">No internet connection</h1>
        <p className="mt-3 text-ink-600">
          GoPasal can’t be reached from this device right now. Nothing you were part-way through has
          been sent, so check your connection and try that step again once you’re back online.
        </p>
        <div className="mt-8">
          <Link href="/dashboard" className="gp-btn gp-btn-primary px-6 py-3">
            <RotateCcw className="h-4 w-4" /> Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
