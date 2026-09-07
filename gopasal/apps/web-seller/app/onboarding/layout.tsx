"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "@gopasal/ui";
import { LogOut } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/components/auth-provider";

/**
 * Chrome for the application screen.
 *
 * Deliberately *not* `DashboardShell`: there is no shop yet, so a sidebar full of
 * orders, catalogue and delivery links would be a menu of dead ends. What a seller
 * needs here is the brand, who they are signed in as, and a way out.
 *
 * `RequireAuth` without `requireLiveShop` — this is the one authenticated screen a
 * seller with no shop is supposed to reach.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Chrome>{children}</Chrome>
    </RequireAuth>
  );
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { user, hasLiveShop, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur md:px-6">
        <Logo variant="full" height={28} />
        <div className="ml-auto flex items-center gap-3">
          {hasLiveShop && (
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-crimson-600 hover:underline"
            >
              Go to dashboard
            </Link>
          )}
          {user && (
            <span className="hidden text-sm text-ink-500 sm:inline">
              {user.name?.trim() || `+977 ${user.phone}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">{children}</main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-10 text-xs text-ink-400 md:px-6">
        Operated by Velayon Dynamics Pvt. Ltd., registered in Nepal.
      </footer>
    </div>
  );
}
