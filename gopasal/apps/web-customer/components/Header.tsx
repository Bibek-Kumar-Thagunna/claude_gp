"use client";

import * as React from "react";
import Link from "next/link";
import { MapPin, Search, ShoppingBag, Menu, X, Store, Globe, User } from "lucide-react";
import { Logo } from "@gopasal/ui";
import { useLang, useCart } from "@/components/providers";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function Header() {
  const { lang, toggle } = useLang();
  const { count } = useCart();
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-ink-200 bg-white/85 backdrop-blur-md shadow-soft"
          : "bg-transparent",
      )}
    >
      <div className="gp-container flex h-[68px] items-center gap-3 md:gap-5">
        <Link href="/" aria-label="GoPasal home" className="shrink-0">
          <Logo variant="full" height={30} />
        </Link>

        {/* location — hidden on tiny screens */}
        <button className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 sm:inline-flex">
          <MapPin className="h-4 w-4 text-crimson-500" />
          <span className="max-w-[120px] truncate">Baneshwor, KTM</span>
        </button>

        {/* search — grows */}
        <label className="relative hidden flex-1 items-center md:flex">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-ink-400" />
          <input
            type="search"
            placeholder={t("searchPlaceholder", lang)}
            className="h-11 w-full rounded-full border border-ink-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
          />
        </label>

        <div className="ml-auto flex items-center gap-2 md:gap-2.5">
          {/* customer account / log in — primary customer control, first */}
          <Link
            href="/login"
            className="hidden items-center gap-1.5 rounded-full border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-800 transition hover:border-crimson-300 hover:bg-crimson-50 hover:text-crimson-700 sm:inline-flex"
          >
            <User className="h-4 w-4" />
            {t("login", lang)}
          </Link>

          <Link
            href="/cart"
            aria-label="Cart"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-crimson-500 text-white shadow-[0_4px_12px_-2px_rgba(225,25,69,0.35)] transition hover:scale-105 hover:shadow-[0_6px_16px_-2px_rgba(225,25,69,0.45)]"
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F6A609] px-1 text-xs font-bold text-ink-900">
                {count}
              </span>
            )}
          </Link>

          {/* divider separates the customer purchase controls (log in, cart)
              from the secondary utilities (language, merchant link) */}
          <span className="mx-0.5 hidden h-6 w-px bg-ink-200 sm:block" aria-hidden />

          <button
            onClick={toggle}
            aria-label="Toggle language"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-100"
          >
            <Globe className="h-4 w-4" />
            <span className={lang === "np" ? "deva" : ""}>{lang === "en" ? "EN" : "ने"}</span>
          </button>

          {/* secondary — "Sell on GoPasal" is a merchant action, quieter link,
              kept last and spaced apart from the language toggle */}
          <Link
            href="/sell"
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 lg:inline-flex"
          >
            <Store className="h-4 w-4 text-crimson-500" />
            {t("becomeSeller", lang)}
          </Link>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-800 hover:bg-ink-100 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* mobile search + menu */}
      <div className="gp-container pb-3 md:hidden">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-ink-400" />
          <input
            type="search"
            placeholder={t("searchPlaceholder", lang)}
            className="h-11 w-full rounded-full border border-ink-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
          />
        </label>
      </div>

      {menuOpen && (
        <nav className="gp-container flex flex-col gap-1 border-t border-ink-100 pb-4 pt-3 md:hidden">
          {/* customer auth — one unified entry (no separate sign up) */}
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="mb-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-crimson-500 px-4 py-2.5 text-sm font-semibold text-white shadow-crimson transition hover:bg-crimson-600"
          >
            <User className="h-4 w-4" />
            {t("login", lang)}
          </Link>

          <Link
            href="/orders"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            {t("orders", lang)}
          </Link>
          <Link
            href="/how-it-works"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            {t("howItWorks", lang)}
          </Link>
          <Link
            href="/get-app"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            {t("getApp", lang)}
          </Link>

          <div className="my-1 h-px bg-ink-100" />

          <Link
            href="/sell"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          >
            <Store className="h-4 w-4 text-crimson-500" />
            {t("becomeSeller", lang)}
          </Link>
        </nav>
      )}
    </header>
  );
}

export default Header;
