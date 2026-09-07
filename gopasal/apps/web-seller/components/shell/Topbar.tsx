"use client";

import * as React from "react";
import { Menu, ShieldCheck, LogOut } from "lucide-react";
import { useShops } from "@/components/shop-provider";
import { useAuth } from "@/components/auth-provider";
import { NotificationBell } from "./NotificationBell";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { activeShop, activeShopId, shops, loading, error } = useShops();
  const { user, signOut, roleNames, roleNameForShop } = useAuth();
  const [accountOpen, setAccountOpen] = React.useState(false);
  const accountRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // What the console is pointed at. Null while the list is still loading, so the
  // strip stays empty rather than claiming a scope we have not confirmed — and null
  // when the list failed, for the same reason. A failed read used to fall through
  // to `shops.length === 0` and print "Managing No shop yet", which tells a seller
  // their shops are gone while `ShopSwitcher` says "Shops unavailable" in the
  // sidebar beside it. The switcher already carries the failure and its message; a
  // second, blunter copy of it here would only contradict the first.
  const scopeLabel =
    loading || error
      ? null
      : shops.length === 0
        ? "No shop yet"
        : activeShopId === null
          ? "All shops"
          : activeShop?.name ?? null;
  // Real signed-in account. The phone is the fallback because an OTP sign-up has
  // no name until the seller gives one on their application.
  const displayName = user?.name?.trim() || (user ? `+977 ${user.phone}` : "Signed out");
  const initial = (user?.name?.trim()?.[0] ?? user?.phone?.[0] ?? "?").toUpperCase();
  // The role the API reported, shown and nothing more. There used to be a
  // "viewing as" switcher here that re-rendered the console as any fixture role.
  // It is gone: with authorization coming from `/auth/me`, pretending to be
  // another role in the browser could only ever disagree with what the API will
  // allow, and a console that offers a button the server refuses is worse than
  // one that offers nothing.
  //
  // With a shop in scope the role is that shop's, which is the exact answer.
  // Across shops an account may hold several, so it counts them instead.
  const scopedRole = activeShopId ? roleNameForShop(activeShopId) : null;
  const roleLabel =
    scopedRole ?? (roleNames.length > 1 ? `${roleNames.length} roles` : roleNames[0] ?? null);


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
        {scopeLabel && (
          <>
            <span className="truncate">Managing</span>
            <span className="truncate font-semibold text-ink-800">{scopeLabel}</span>
          </>
        )}
      </div>

      {/*
        There is deliberately no global search box here any more.

        The one that stood in this spot was an uncontrolled `<input type="search">`
        with no `value`, no `onChange`, no enclosing `<form>` and no consumer
        anywhere in the file — every character typed into it was discarded, and its
        placeholder ("Search orders, products…") promised a cross-entity search
        GoPasal has no endpoint for. It was also the most prominent control in the
        chrome and present on every authenticated page, so it was the console's
        single most-encountered dead capability.

        Real search does exist, per screen, on the list that owns the data: orders on
        /orders, products on /catalog, stock on /inventory, coupons on /promotions and
        reviews on /reviews all send a server-side `?q=`. /staff is the one exception
        and is the browser filtering a list it already holds in full — `GET
        …/shops/:shopId/staff` accepts no query parameters at all — so it must not be
        described as a server search either. Each screen searches the one collection it
        can actually query. Nothing here should imply that a single box searches across
        all of them.
      */}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {roleLabel && (
          <span
            className="hidden items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-2 text-xs font-medium text-ink-600 sm:inline-flex"
            title="Your role on this shop, as the API reports it"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="font-semibold text-ink-900">{roleLabel}</span>
          </span>
        )}

        {/*
          There is deliberately no EN/ने language toggle here any more.

          It looked like the console's bilingual switch and it was not one. Clicking
          it changed two things: the glyph inside the button, and a
          `gp-seller-lang` key in `localStorage`. Nothing read either. Not one
          rendered string anywhere in the console consulted the selected language,
          because the phrasebook behind it (a `lib/i18n.ts` of fifteen words) was
          never wired to a screen — so a seller who switched to नेपाली got an
          all-English console with a Nepali-looking button.

          The Nepali that *is* in the console is real and unaffected: permission and
          role labels carry a Devanagari line of their own (`lib/rbac.ts`,
          `lib/team-view.ts`), rendered with `lang="ne"` beside the English. That is
          static bilingual content, not a translation layer.

          A real language switch means every label, every server message and every
          date and number format having a Nepali form, and that is a build, not a
          button. Until it exists the console should not offer the control.
        */}

        {/* Real bell: unread count from `GET /notifications/unread-count`, list and
            mark-read from the same controller. It used to be a dead button with a
            red dot painted on unconditionally — a permanent "you have mail" that
            was never true and could never be cleared. */}
        <NotificationBell />

        <div ref={accountRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-crimson-500 text-sm font-bold text-white"
            aria-label="Account menu"
            aria-expanded={accountOpen}
          >
            {initial}
          </button>
          {accountOpen && (
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
                {user?.name && <p className="truncate text-xs text-ink-500">+977 {user.phone}</p>}
              </div>
              <div className="my-1 h-px bg-ink-100" />
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  void signOut();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
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
