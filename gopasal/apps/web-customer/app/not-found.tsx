import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { Logo } from "@gopasal/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 py-20">
      <div className="max-w-md text-center">
        <div className="flex justify-center"><Logo variant="mark" height={56} /></div>
        <p className="mt-8 font-display text-7xl font-extrabold text-crimson-500">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink-900">This shop shelf is empty</h1>
        <p className="mt-3 text-ink-600">
          The page you’re looking for has moved or never existed. Let’s get you back to the shops.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/" className="gp-btn gp-btn-primary px-6 py-3">
            <Home className="h-4 w-4" /> Back home
          </Link>
          <Link
            href="/shops"
            className="gp-btn border border-ink-200 bg-white px-6 py-3 text-ink-800 hover:bg-ink-100"
          >
            <Compass className="h-4 w-4" /> Browse shops
          </Link>
        </div>
      </div>
    </div>
  );
}
