import Link from "next/link";
import { WifiOff, RotateCcw } from "lucide-react";
import { Logo } from "@gopasal/ui";

export const metadata = { title: "You’re offline" };

export default function OfflinePage() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 py-20">
      <div className="max-w-md text-center">
        <Logo variant="mark" height={56} className="mx-auto" />
        <div className="mx-auto mt-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-ink-700">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-ink-900">No internet connection</h1>
        <p className="mt-3 text-ink-600">
          You appear to be offline. Check your connection and try again — your cart is saved on this
          device.
        </p>
        <div className="mt-8">
          <Link href="/" className="gp-btn gp-btn-primary px-6 py-3">
            <RotateCcw className="h-4 w-4" /> Retry
          </Link>
        </div>
      </div>
    </div>
  );
}
