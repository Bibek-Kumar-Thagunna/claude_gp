"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Bell, Globe, LogOut, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLang } from "@/components/providers";
import { useAuth } from "@/components/auth-provider";
import { useOpenApplicationCount } from "@/components/use-open-applications";
import { initials } from "@/lib/format";

/**
 * The chrome shows who is signed in and what is waiting.
 *
 * Both of those are now real. The identity is the account behind the bearer token,
 * and the "waiting for approval" count is `meta.total` from the live review queue
 * rather than a filter over fixture shops. There is no longer a "preview as role"
 * switcher: permissions come from the API, so a switcher could only have pretended
 * to change them.
 */
export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { user, roleName, signOut } = useAuth();
  const waiting = useOpenApplicationCount();

  const [bellOpen, setBellOpen] = React.useState(false);
  const [meOpen, setMeOpen] = React.useState(false);

  const bellRef = React.useRef<HTMLDivElement>(null);
  const meRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (bellRef.current && !bellRef.current.contains(t)) setBellOpen(false);
      if (meRef.current && !meRef.current.contains(t)) setMeOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const alerts = React.useMemo(
    () =>
      [
        ...(waiting && waiting > 0
          ? [
              {
                id: "onboarding-queue",
                href: "/approvals",
                title: `${waiting} shop ${waiting === 1 ? "application" : "applications"} waiting for review`,
                meta: "Seller onboarding queue",
                tone: "marigold" as const,
              },
            ]
          : []),
      ].slice(0, 8),
    [waiting],
  );

  const DOT: Record<string, string> = {
    marigold: "bg-[#F6A609]",
    red: "bg-[#c02636]",
    crimson: "bg-crimson-500",
    blue: "bg-[#1D4ED8]",
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 text-sm text-ink-400 md:flex">
        <ShieldCheck className="h-4 w-4 text-crimson-500" />
        <span className="truncate">Platform console</span>
        <span className="truncate font-semibold text-ink-800">admin.gopasal.com</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "np" : "en")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50"
          aria-label="Toggle language"
        >
          <Globe className="h-4 w-4" />
          <span className={cn(lang === "np" && "deva")}>{lang === "en" ? "EN" : "ने"}</span>
        </button>

        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {alerts.length > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-crimson-500" />
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
              <p className="border-b border-ink-100 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Needs attention
              </p>
              <ul className="max-h-80 overflow-y-auto">
                {alerts.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-ink-500">Nothing waiting on you.</li>
                )}
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      onClick={() => setBellOpen(false)}
                      className="flex gap-2.5 px-3 py-2.5 hover:bg-ink-50"
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[a.tone])} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink-800">{a.title}</span>
                        <span className="block truncate text-xs text-ink-500">{a.meta}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/audit"
                onClick={() => setBellOpen(false)}
                className="block border-t border-ink-100 px-3 py-2.5 text-center text-xs font-semibold text-crimson-600 hover:bg-crimson-50"
              >
                View the full audit trail
              </Link>
            </div>
          )}
        </div>

        <div ref={meRef} className="relative">
          <button
            type="button"
            onClick={() => setMeOpen((v) => !v)}
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-crimson-500 text-sm font-bold text-white"
            aria-label="Account"
          >
            {initials(user?.name ?? user?.phone ?? "GP")}
          </button>
          {meOpen && (
            <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
              <div className="border-b border-ink-100 px-3 py-3">
                <p className="text-sm font-bold text-ink-900">{user?.name ?? "Platform staff"}</p>
                <p className="text-xs text-ink-500">{user?.email ?? `+977 ${user?.phone ?? ""}`}</p>
                {roleName && (
                  <p className="mt-1 inline-flex rounded-full bg-crimson-50 px-2 py-0.5 text-[11px] font-semibold text-crimson-700">
                    {roleName}
                  </p>
                )}
              </div>
              <Link
                href="/settings"
                onClick={() => setMeOpen(false)}
                className="block px-3 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
              >
                Console settings
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setMeOpen(false);
                  await signOut();
                  router.replace("/login");
                }}
                className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-2.5 text-left text-sm font-semibold text-[#c02636] hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Topbar;
