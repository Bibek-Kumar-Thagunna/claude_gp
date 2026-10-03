"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Search,
  ShoppingBag,
  Menu,
  X,
  Store,
  Globe,
  User,
  Bell,
  Gift,
  MessageCircle,
  Heart,
  UsersRound,
  ChevronDown,
  LogOut,
  Package,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "@gopasal/ui";
import { useAuth, useLang, useCart } from "@/components/providers";
import { useDeliveryLocation } from "@/components/location/LocationProvider";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { customerApi, discoverySearch, type DiscoverySearch } from "@/lib/api/customer";

export function Header() {
  const { lang, toggle } = useLang();
  const { count } = useCart();
  const auth = useAuth();
  const deliveryLocation = useDeliveryLocation();
  const router = useRouter();
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<DiscoverySearch | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [messageUnread, setMessageUnread] = React.useState(0);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/shops?q=${encodeURIComponent(q)}` : "/shops");
    setSearchOpen(false);
  };

  React.useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
  }, []);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions(null);
      setSearching(false);
      setSearchOpen(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      void discoverySearch(q, deliveryLocation.location, controller.signal)
        .then((result) => {
          setSuggestions({
            ...result,
            shops: result.shops.slice(0, 4),
            products: result.products.slice(0, 5),
          });
          setSearchOpen(true);
        })
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [deliveryLocation.location, query]);

  React.useEffect(() => {
    const closeOverlays = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-search-root]")) setSearchOpen(false);
      if (!(event.target as HTMLElement).closest("[data-account-root]")) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOverlays);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOverlays);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  React.useEffect(() => {
    if (auth.status !== "authenticated") {
      setUnread(0);
      setMessageUnread(0);
      return;
    }
    let active = true;
    const load = () => {
      void customerApi
        .notificationCount()
        .then((result) => {
          if (active) setUnread(result.unread);
        })
        .catch(() => undefined);
      void customerApi
        .conversations()
        .then((result) => {
          if (active) setMessageUnread(result.data.filter((row) => row.hasUnread).length);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [auth.status]);

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
        <button
          type="button"
          onClick={deliveryLocation.openPicker}
          className="hidden max-w-[190px] items-center gap-1.5 rounded-full px-3 py-2 text-left text-sm font-medium text-ink-700 transition hover:bg-crimson-50 hover:text-crimson-700 sm:inline-flex"
          aria-label="Choose delivery location"
        >
          <MapPin className="h-4 w-4 text-crimson-500" />
          <span className="truncate">
            {deliveryLocation.location?.label ?? "Set delivery location"}
          </span>
        </button>

        {/* search — grows */}
        <form
          data-search-root
          onSubmit={submitSearch}
          className="relative hidden flex-1 items-center md:flex"
          role="search"
        >
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder", lang)}
            onFocus={() => query.trim().length >= 2 && setSearchOpen(true)}
            aria-label="Search shops and products"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen}
            aria-controls="desktop-search-results"
            className="h-11 w-full rounded-full border border-ink-200 bg-white pl-11 pr-24 text-sm outline-none transition focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
          />
          <button
            type="submit"
            className="absolute right-1.5 inline-flex h-8 items-center gap-1 rounded-full bg-ink-900 px-3 text-xs font-bold text-white transition hover:bg-crimson-600"
            aria-label="Search"
          >
            Search <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {searchOpen && (
            <SearchSuggestions
              id="desktop-search-results"
              query={query}
              result={suggestions}
              loading={searching}
              close={() => setSearchOpen(false)}
            />
          )}
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {auth.status !== "authenticated" && (
            <Link
              href="/login"
              className="hidden items-center gap-1.5 rounded-full border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-800 transition hover:border-crimson-300 hover:bg-crimson-50 hover:text-crimson-700 sm:inline-flex"
            >
              <User className="h-4 w-4" /> {t("login", lang)}
            </Link>
          )}

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

          {auth.status === "authenticated" && (
            <Link
              href="/notifications"
              aria-label={`${unread} unread notifications`}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition hover:border-crimson-300 hover:bg-crimson-50"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F6A609] px-1 text-xs font-bold text-ink-900">
                  {Math.min(unread, 99)}
                </span>
              )}
            </Link>
          )}

          <button
            onClick={toggle}
            aria-label="Toggle language"
            className={cn(
              "items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-100",
              auth.status === "authenticated" ? "inline-flex md:hidden" : "inline-flex",
            )}
          >
            <Globe className="h-4 w-4" />
            <span className={lang === "np" ? "deva" : ""}>{lang === "en" ? "EN" : "ने"}</span>
          </button>

          {auth.status !== "authenticated" && (
            <Link
              href="/sell"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 xl:inline-flex"
            >
              <Store className="h-4 w-4 text-crimson-500" />
              {t("becomeSeller", lang)}
            </Link>
          )}

          {auth.status === "authenticated" && (
            <div data-account-root className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-ink-200 bg-white py-1 pl-1 pr-3 text-sm font-semibold text-ink-800 transition hover:border-crimson-300 hover:bg-crimson-50"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-crimson-500 font-bold text-white">
                  {(auth.user?.name?.trim().charAt(0) || "A").toUpperCase()}
                </span>
                <span className="max-w-24 truncate">
                  {auth.user?.name?.split(" ")[0] ?? "Account"}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-ink-400 transition", accountOpen && "rotate-180")}
                />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.65rem)] z-[80] w-72 overflow-hidden rounded-2xl border border-ink-100 bg-white p-2 shadow-float"
                >
                  <div className="border-b border-ink-100 px-3 pb-3 pt-2">
                    <p className="truncate text-sm font-bold text-ink-900">
                      {auth.user?.name ?? "Your account"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">Customer account</p>
                  </div>
                  <div className="py-1.5">
                    <HeaderMenuLink href="/account" icon={User} label="Account & addresses" close={() => setAccountOpen(false)} />
                    <HeaderMenuLink href="/orders" icon={Package} label="Your orders" close={() => setAccountOpen(false)} />
                    <HeaderMenuLink href="/saved" icon={Heart} label="Saved items" close={() => setAccountOpen(false)} />
                    <HeaderMenuLink href="/messages" icon={MessageCircle} label="Shop messages" count={messageUnread} close={() => setAccountOpen(false)} />
                    <HeaderMenuLink href="/rewards" icon={Gift} label="Rewards & referrals" close={() => setAccountOpen(false)} />
                    <HeaderMenuLink href="/group-orders" icon={UsersRound} label="Order together" close={() => setAccountOpen(false)} />
                  </div>
                  <div className="border-t border-ink-100 pt-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={toggle}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                    >
                      <Globe className="h-4 w-4" /> Language · {lang === "en" ? "English" : "नेपाली"}
                    </button>
                    <HeaderMenuLink href="/sell" icon={Store} label={t("becomeSeller", lang)} close={() => setAccountOpen(false)} />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        void auth.signOut();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-crimson-50 hover:text-crimson-700"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
        <button
          type="button"
          onClick={deliveryLocation.openPicker}
          className="mb-2 flex w-full items-center gap-2 rounded-xl bg-crimson-50 px-3 py-2 text-left text-sm font-semibold text-crimson-800"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {deliveryLocation.location?.label ?? "Choose where you want delivery"}
          </span>
          <span className="text-xs font-bold">Change</span>
        </button>
        <form
          data-search-root
          onSubmit={submitSearch}
          className="relative flex items-center"
          role="search"
        >
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder", lang)}
            onFocus={() => query.trim().length >= 2 && setSearchOpen(true)}
            aria-label="Search shops and products"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen}
            aria-controls="mobile-search-results"
            className="h-11 w-full rounded-full border border-ink-200 bg-white pl-11 pr-14 text-sm outline-none focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
          />
          <button
            type="submit"
            className="absolute right-1.5 grid h-8 w-9 place-items-center rounded-full bg-ink-900 text-white"
            aria-label="Search"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          {searchOpen && (
            <SearchSuggestions
              id="mobile-search-results"
              query={query}
              result={suggestions}
              loading={searching}
              close={() => setSearchOpen(false)}
            />
          )}
        </form>
      </div>

      {menuOpen && (
        <nav className="gp-container flex flex-col gap-1 border-t border-ink-100 pb-4 pt-3 md:hidden">
          {/* customer auth — one unified entry (no separate sign up) */}
          {auth.status === "authenticated" ? (
            <button
              onClick={() => {
                setMenuOpen(false);
                void auth.signOut();
              }}
              className="mb-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="mb-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-crimson-500 px-4 py-2.5 text-sm font-semibold text-white shadow-crimson transition hover:bg-crimson-600"
            >
              <User className="h-4 w-4" /> {t("login", lang)}
            </Link>
          )}

          <Link
            href="/account"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            Account & addresses
          </Link>
          <Link
            href="/orders"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            {t("orders", lang)}
          </Link>
          <Link
            href="/saved"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            Saved shops & products
          </Link>
          <Link
            href="/messages"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            Shop messages{messageUnread > 0 ? ` (${messageUnread})` : ""}
          </Link>
          <Link
            href="/rewards"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            Rewards & referrals
          </Link>
          <Link
            href="/group-orders"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2.5 font-medium hover:bg-ink-100"
          >
            Order together
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

function HeaderMenuLink({
  href,
  icon: Icon,
  label,
  count = 0,
  close,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  close: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={close}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-crimson-50 hover:text-crimson-700"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#F6A609] px-1 text-[11px] font-bold text-ink-900">
          {Math.min(count, 99)}
        </span>
      )}
    </Link>
  );
}

function SearchSuggestions({
  id,
  query,
  result,
  loading,
  close,
}: {
  id: string;
  query: string;
  result: DiscoverySearch | null;
  loading: boolean;
  close: () => void;
}) {
  return (
    <div
      id={id}
      className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-[70] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-float"
      role="listbox"
    >
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Live results</span>
        {loading && <span className="text-xs text-ink-400">Searching…</span>}
      </div>
      {!loading && !result?.shops.length && !result?.products.length ? (
        <p className="px-4 py-4 text-sm text-ink-500">
          No shops or products found for “{query.trim()}”.
        </p>
      ) : (
        <>
          {result?.products.map(({ product, store }) => (
            <Link
              key={`product-${product.id}`}
              role="option"
              href={`/store/${store.slug}`}
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-crimson-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-crimson-50 text-crimson-600">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-ink-900">{product.name}</strong>
                <small className="block truncate text-ink-500">from {store.name}</small>
              </span>
              <ArrowRight className="h-4 w-4 text-ink-400" />
            </Link>
          ))}
          {result?.shops.map((row) => (
            <Link
              key={`shop-${row.id}`}
              role="option"
              href={`/store/${row.slug}`}
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-crimson-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-paper text-xl">
                {row.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-ink-900">{row.name}</strong>
                <small className="flex items-center gap-1 text-ink-500">
                  <MapPin className="h-3 w-3" />
                  {row.area}
                  {row.distanceMeters != null && ` · ${(row.distanceMeters / 1000).toFixed(1)} km`}
                </small>
              </span>
              <ArrowRight className="h-4 w-4 text-ink-400" />
            </Link>
          ))}
        </>
      )}
      <Link
        href={`/shops?q=${encodeURIComponent(query.trim())}`}
        onClick={close}
        className="flex items-center justify-center gap-1.5 border-t border-ink-100 px-4 py-3 text-sm font-bold text-crimson-600 hover:bg-crimson-50"
      >
        See all search results <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default Header;
