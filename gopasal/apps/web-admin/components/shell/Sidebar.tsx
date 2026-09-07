"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  ClipboardCheck,
  Users,
  PackageSearch,
  Scale,
  ShieldAlert,
  LifeBuoy,
  FileText,
  BarChart3,
  Wallet,
  Ticket,
  KeyRound,
  UserCog,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@gopasal/ui";
import { cn } from "@/lib/cn";
import { useAdmin } from "@/components/providers";
import { useAuth } from "@/components/auth-provider";
import { useOpenApplicationCount } from "@/components/use-open-applications";
import { type PermissionId } from "@/lib/rbac";

type BadgeKey =
  | "pendingShops"
  | "moderationQueue"
  | "openDisputes"
  | "openFraud"
  | "openTickets";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when the role holds at least one of these permissions. */
  perms: PermissionId[];
  badgeKey?: BadgeKey;
};

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perms: ["admin.dashboard.view"] },
    ],
  },
  {
    section: "Marketplace",
    items: [
      { href: "/shops", label: "Shops", icon: Store, perms: ["shops.view"] },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck, perms: ["shops.approve", "shops.reject"], badgeKey: "pendingShops" },
      { href: "/users", label: "Users", icon: Users, perms: ["users.view"] },
      { href: "/catalog", label: "Catalog moderation", icon: PackageSearch, perms: ["catalog.moderate"], badgeKey: "moderationQueue" },
    ],
  },
  {
    section: "Trust & safety",
    items: [
      { href: "/disputes", label: "Disputes", icon: Scale, perms: ["disputes.view"], badgeKey: "openDisputes" },
      { href: "/fraud", label: "Fraud", icon: ShieldAlert, perms: ["fraud.view"], badgeKey: "openFraud" },
      { href: "/support", label: "Support", icon: LifeBuoy, perms: ["support.view"], badgeKey: "openTickets" },
      { href: "/policies", label: "Policies", icon: FileText, perms: ["policy.view"] },
    ],
  },
  {
    section: "Business",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, perms: ["analytics.platform.view"] },
      { href: "/finance", label: "Finance", icon: Wallet, perms: ["finance.view"] },
      { href: "/coupons", label: "Coupons", icon: Ticket, perms: ["coupons.manage"] },
    ],
  },
  {
    section: "Governance",
    items: [
      { href: "/roles", label: "Roles & permissions", icon: KeyRound, perms: ["rbac.platform.manage"] },
      { href: "/staff", label: "Platform staff", icon: UserCog, perms: ["rbac.platform.manage"] },
      { href: "/audit", label: "Audit log", icon: ScrollText, perms: ["audit.view"] },
      { href: "/settings", label: "Settings", icon: Settings, perms: ["admin.dashboard.view"] },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can, moderation, disputes, fraud, tickets } = useAdmin();
  const { superAdmin, roleName } = useAuth();
  const openApplications = useOpenApplicationCount();

  // `pendingShops` is the real onboarding queue; the rest are still fixtures.
  const badges: Record<BadgeKey, number> = React.useMemo(
    () => ({
      pendingShops: openApplications ?? 0,
      moderationQueue: moderation.filter((p) => p.isActive).length,
      openDisputes: disputes.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW").length,
      openFraud: fraud.filter((f) => f.status === "OPEN" || f.status === "REVIEWING").length,
      openTickets: tickets.filter((t) => t.status === "OPEN" || t.status === "PENDING").length,
    }),
    [openApplications, moderation, disputes, fraud, tickets],
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <Logo variant="full" height={28} />
          <span className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Admin
          </span>
        </Link>
      </div>

      <nav className="gp-scroll flex-1 overflow-y-auto px-3 py-2">
        {NAV.map((group, gi) => {
          const visible = group.items.filter((it) => it.perms.some((p) => can(p)));
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
                const badge = it.badgeKey ? badges[it.badgeKey] : 0;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="gp-nav"
                    data-active={active}
                    onClick={onNavigate}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="flex-1">{it.label}</span>
                    {badge > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                          active ? "bg-white/20 text-white" : "bg-crimson-500 text-white",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-ink-100 p-4">
        {roleName && (
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                superAdmin ? "bg-crimson-500" : "bg-[#0B9E6B]",
              )}
            />
            Signed in as <span className="font-semibold text-ink-600">{roleName}</span>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          GoPasal Admin · operated by Velayon Dynamics Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}

export default Sidebar;
