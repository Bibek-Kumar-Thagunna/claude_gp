"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Truck,
  Package,
  Boxes,
  BarChart3,
  Wallet,
  Ticket,
  Star,
  Users,
  ShieldCheck,
  Settings,
  type LucideIcon,
  MessageCircle,
} from "lucide-react";
import { Logo } from "@gopasal/ui";
import { cn } from "@/lib/cn";
import { useSeller } from "@/components/providers";
import { useShops } from "@/components/shop-provider";
import { useAuth } from "@/components/auth-provider";
import type { PermissionId } from "@/lib/rbac";
import { ShopSwitcher } from "./ShopSwitcher";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only if the API granted at least one of these keys for this shop. */
  perms: PermissionId[];
};

/**
 * Nav, keyed by the API's own permission names.
 *
 * Every entry has to be a key the API actually issues, or the item is dead: a
 * link nobody can ever see. That is why Analytics no longer also lists a finance
 * key — seller finance has no shop-scope permission yet (see
 * `RETIRED_PERMISSIONS` in `lib/rbac.ts`), so listing it would have been a
 * check that can never pass.
 *
 * Orders no longer carries a count pill. It used to, derived from the `ORDERS`
 * fixture in `lib/data.ts`, which meant it read 0 for every real shop id the API
 * returns — a badge that could only ever be silent or wrong. A truthful one needs
 * a pending-order count endpoint, and none exists; fanning `GET /seller/shops/:id/orders`
 * out over every shop on every render to compute it is not a trade this nav makes.
 */
const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perms: ["dashboard.view"] },
      { href: "/orders", label: "Orders", icon: ShoppingBag, perms: ["orders.view"] },
      { href: "/messages", label: "Messages", icon: MessageCircle, perms: ["messages.view"] },
      { href: "/delivery", label: "Delivery", icon: Truck, perms: ["delivery.view"] },
    ],
  },
  {
    section: "Catalog",
    items: [
      { href: "/catalog", label: "Products", icon: Package, perms: ["catalog.view"] },
      { href: "/inventory", label: "Inventory", icon: Boxes, perms: ["inventory.view"] },
      { href: "/promotions", label: "Promotions", icon: Ticket, perms: ["promotions.view"] },
    ],
  },
  {
    section: "Business",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, perms: ["analytics.view"] },
      { href: "/finance", label: "Finance", icon: Wallet, perms: ["finance.view"] },
      { href: "/reviews", label: "Reviews", icon: Star, perms: ["reviews.view"] },
      { href: "/staff", label: "Staff", icon: Users, perms: ["team.view"] },
      { href: "/roles", label: "Roles & permissions", icon: ShieldCheck, perms: ["rbac.manage"] },
      { href: "/settings", label: "Settings", icon: Settings, perms: ["settings.view"] },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { canAny } = useSeller();
  const { activeShopId } = useShops();
  const { roleNames, roleNameForShop, shops } = useAuth();

  // Display only, and the real thing: the role name the API reported. With a
  // shop in scope that shop's role is the precise answer; across shops an
  // account can hold several, so say how many rather than pick one. When
  // `/auth/me` named no role at all — a brand-new account, or a session read that
  // has not landed yet — this is `null` and the footer says nothing about a role.
  // It used to read "Staff", which is a role name the API never sent and which
  // this platform does not guarantee exists in any shop.
  const scopedRole = activeShopId ? roleNameForShop(activeShopId) : null;
  const roleLabel: string | null =
    scopedRole ?? (roleNames.length > 1 ? `${roleNames.length} roles` : (roleNames[0] ?? null));
  const owner = activeShopId
    ? shops.find((s) => s.shopId === activeShopId)?.owner === true
    : shops.some((s) => s.owner);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <Logo variant="full" height={28} />
          <span className="rounded-md bg-crimson-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-crimson-600">
            Seller
          </span>
        </Link>
      </div>

      <div className="px-4 pb-2">
        <ShopSwitcher />
      </div>

      <nav className="gp-scroll flex-1 overflow-y-auto px-3 py-2">
        {NAV.map((group, gi) => {
          const visible = group.items.filter((it) => canAny(it.perms));
          if (visible.length === 0) return null;
          return (
            <div key={gi} className="mb-1">
              {group.section && (
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {group.section}
                </p>
              )}
              {visible.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="gp-nav"
                    data-active={active}
                    /*
                      `data-active` is a styling hook and nothing more — it reaches CSS,
                      never assistive technology, so which page you are on was conveyed
                      by the crimson pill alone. `aria-current="page"` is the attribute
                      a screen reader reads out, and it is left off entirely on the
                      other items rather than set to a falsy string.
                    */
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="flex-1">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-ink-100 p-4">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              owner ? "bg-crimson-500" : "bg-[#0B9E6B]",
            )}
          />
          {roleLabel ? (
            <>
              Signed in as <span className="font-semibold text-ink-600">{roleLabel}</span>
            </>
          ) : (
            "Signed in"
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          GoPasal Seller · operated by Velayon Dynamics Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
