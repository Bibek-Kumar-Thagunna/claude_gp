"use client";

import * as React from "react";
import Link from "next/link";
import {
  PackageSearch,
  Search,
  EyeOff,
  Eye,
  Flag,
  AlertTriangle,
  Store,
  CheckCircle2,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  FilterPills,
  SearchInput,
  EmptyState,
  Switch,
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { PermissionGate } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW } from "@/lib/data";
import { rs, num, ago } from "@/lib/format";

type Filter = "LIVE" | "HIDDEN" | "HIGH" | "ALL";

type Severity = { label: string; tone: "red" | "marigold" | "ink"; bar: string };

/** Named separately so it can serve as the guaranteed fallback below. */
const SEVERITY_LOW: Severity = { label: "Low", tone: "ink", bar: "bg-ink-300" };

const SEVERITY: Record<string, Severity> = {
  high: { label: "High risk", tone: "red", bar: "bg-[#c02636]" },
  medium: { label: "Medium", tone: "marigold", bar: "bg-[#F6A609]" },
  low: SEVERITY_LOW,
};

export default function CatalogPage() {
  return (
    <PermissionGate
      perm="catalog.moderate"
      title="You can’t moderate the catalogue"
      description="Hiding or restoring listings needs the “Moderate catalogue” permission."
    >
      <CatalogInner />
    </PermissionGate>
  );
}

function CatalogInner() {
  const { lang } = useLang();
  const { moderation, setProductVisible } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("LIVE");
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<{ id: string; hide: boolean } | null>(null);

  const counts = React.useMemo(
    () => ({
      ALL: moderation.length,
      LIVE: moderation.filter((p) => p.isActive).length,
      HIDDEN: moderation.filter((p) => !p.isActive).length,
      HIGH: moderation.filter((p) => p.severity === "high").length,
    }),
    [moderation],
  );

  const totalReports = React.useMemo(
    () => moderation.reduce((s, p) => s + p.reports, 0),
    [moderation],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const order = { high: 0, medium: 1, low: 2 } as const;
    return moderation
      .filter((p) => {
        if (filter === "LIVE") return p.isActive;
        if (filter === "HIDDEN") return !p.isActive;
        if (filter === "HIGH") return p.severity === "high";
        return true;
      })
      .filter((p) => {
        if (!needle) return true;
        return (
          p.name.toLowerCase().includes(needle) ||
          p.shopName.toLowerCase().includes(needle) ||
          p.category.toLowerCase().includes(needle) ||
          p.reportReason.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => order[a.severity] - order[b.severity] || b.reports - a.reports);
  }, [moderation, filter, q]);

  const target = pending ? moderation.find((p) => p.id === pending.id) : null;

  return (
    <>
      <PageHeader
        icon={<PackageSearch className="h-5 w-5" />}
        title={lang === "np" ? "सामान अनुगमन" : "Catalogue moderation"}
        subtitle={
          lang === "np"
            ? "ग्राहकले रिपोर्ट गरेका सूचीहरू जाँच गर्नुहोस् — लुकाउनु भनेको मेटाउनु होइन"
            : "Listings customers reported. Hiding is reversible — nothing is deleted from the shop."
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live and reported"
          value={num(counts.LIVE)}
          icon={Flag}
          tone={counts.LIVE ? "crimson" : "ink"}
        />
        <StatCard
          label="High-risk listings"
          value={num(counts.HIGH)}
          icon={AlertTriangle}
          tone={counts.HIGH ? "red" : "ink"}
        />
        <StatCard label="Hidden by staff" value={num(counts.HIDDEN)} icon={EyeOff} tone="ink" />
        <StatCard label="Customer reports" value={num(totalReports)} icon={Flag} tone="marigold" />
      </Reveal>

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "LIVE", label: "Live", count: counts.LIVE },
            { value: "HIGH", label: "High risk", count: counts.HIGH },
            { value: "HIDDEN", label: "Hidden", count: counts.HIDDEN },
            { value: "ALL", label: "All", count: counts.ALL },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Product, shop or reason"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Nothing to moderate here"
          description="No reported listing matches this view. New reports land here automatically."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((p, i) => {
            const sev = SEVERITY[p.severity] ?? SEVERITY_LOW;
            return (
              <Reveal key={p.id} delay={i * 0.04}>
                <Card className="relative h-full overflow-hidden pb-5">
                  <span className={`absolute inset-y-0 left-0 w-1 ${sev.bar}`} aria-hidden />
                  <SectionTitle
                    title={p.name}
                    hint={`${p.category} · ${rs(p.price)} · listed ${ago(p.createdAt, NOW)}`}
                    action={
                      <Badge tone={sev.tone} dot>
                        {sev.label}
                      </Badge>
                    }
                  />
                  <div className="px-5 pt-4">
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        <Flag className="h-3.5 w-3.5" /> {num(p.reports)} report
                        {p.reports === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-sm text-ink-800">{p.reportReason}</p>
                    </div>

                    <Link
                      href={`/shops/${p.shopId}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-crimson-700 hover:underline"
                    >
                      <Store className="h-4 w-4" /> {p.shopName}
                    </Link>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
                      <span className="flex items-center gap-2 text-sm">
                        {p.isActive ? (
                          <Eye className="h-4 w-4 text-[#0B7E58]" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-ink-400" />
                        )}
                        <span className="font-semibold text-ink-800">
                          {p.isActive ? "Visible to customers" : "Hidden from customers"}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Switch
                          checked={p.isActive}
                          onChange={(v) => setPending({ id: p.id, hide: !v })}
                          label={`Toggle visibility of ${p.name}`}
                        />
                        <Button
                          variant={p.isActive ? "danger" : "outline"}
                          size="sm"
                          onClick={() => setPending({ id: p.id, hide: p.isActive })}
                        >
                          {p.isActive ? (
                            <>
                              <EyeOff className="h-4 w-4" /> Hide
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4" /> Restore
                            </>
                          )}
                        </Button>
                      </span>
                    </div>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) setProductVisible(pending.id, !pending.hide);
          setPending(null);
        }}
        title={pending?.hide ? "Hide this listing?" : "Restore this listing?"}
        description={
          pending?.hide
            ? `“${target?.name ?? "This product"}” disappears from search and the shop page immediately. The shop keeps the record and can edit it.`
            : `“${target?.name ?? "This product"}” becomes visible to customers again.`
        }
        confirmLabel={pending?.hide ? "Hide listing" : "Restore listing"}
        destructive={Boolean(pending?.hide)}
        reasonLabel={pending?.hide ? "Reason sent to the shop" : undefined}
        reasonRequired={Boolean(pending?.hide)}
      />
    </>
  );

}

