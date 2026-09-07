import Link from "next/link";
import { Compass, LayoutDashboard } from "lucide-react";

export default function AppNotFound() {
  return (
    <div className="gp-panel mx-auto max-w-lg px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-700">
        <Compass className="h-7 w-7" />
      </span>
      <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">404</p>
      <h1 className="mt-2 text-xl font-bold text-ink-900">That console screen doesn’t exist</h1>
      <p className="mt-2 text-sm text-ink-600">
        The link may be outdated, or the section is not part of your role. Use the sidebar to reach the
        queues you have access to.
      </p>
      <div className="mt-7">
        <Link href="/dashboard" className="gp-btn gp-btn-primary px-5 py-2.5 text-sm">
          <LayoutDashboard className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
