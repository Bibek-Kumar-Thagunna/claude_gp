"use client";

import * as React from "react";
import {
  History,
  Search,
  Store,
  User,
  PackageSearch,
  Scale,
  ShieldAlert,
  ScrollText,
  KeyRound,
  TicketPercent,
  LifeBuoy,
  Globe,
  ArrowRight,
  Fingerprint,
  CalendarDays,
  Users,
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
  KeyValue,
  Avatar,
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { PermissionGate } from "@/components/PermissionGate";
import { Drawer } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type AuditEntry } from "@/lib/data";
import { num, ago, fullDate, dayMonth } from "@/lib/format";

type Filter = "ALL" | AuditEntry["entityType"];

const ENTITY = {
  shop: { label: "Shops", icon: Store, chip: "bg-[#FFF3DF] text-[#8a5a00]" },
  user: { label: "People", icon: User, chip: "bg-[#EAF1FE] text-[#1D4ED8]" },
  product: { label: "Listings", icon: PackageSearch, chip: "bg-ink-100 text-ink-600" },
  dispute: { label: "Disputes", icon: Scale, chip: "bg-crimson-50 text-crimson-700" },
  fraud: { label: "Fraud", icon: ShieldAlert, chip: "bg-red-50 text-[#c02636]" },
  policy: { label: "Policies", icon: ScrollText, chip: "bg-[#EAF7EF] text-[#0B7E58]" },
  role: { label: "Roles", icon: KeyRound, chip: "bg-crimson-50 text-crimson-700" },
  coupon: { label: "Coupons", icon: TicketPercent, chip: "bg-[#FFF3DF] text-[#8a5a00]" },
  ticket: { label: "Support", icon: LifeBuoy, chip: "bg-[#EAF1FE] text-[#1D4ED8]" },
} as const;

const ORDER: AuditEntry["entityType"][] = [
  "shop",
  "user",
  "product",
  "dispute",
  "fraud",
  "policy",
  "role",
  "coupon",
  "ticket",
];

/** "shop.suspend" → "Shop suspend" — readable without maintaining a second dictionary. */
function actionLabel(action: string) {
  const parts = action.split(".");
  const verb = parts[parts.length - 1] ?? action;
  const rest = parts.slice(0, -1).join(" ");
  const s = `${rest} ${verb}`.replace(/[_-]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const dayKey = (iso: string) => iso.slice(0, 10);

export default function AuditPage() {
  return (
    <PermissionGate
      perm="audit.view"
      title="You can’t see the audit log"
      description="The record of who changed what needs the “View audit log” permission."
    >
      <AuditInner />
    </PermissionGate>
  );
}

function AuditInner() {
  const { lang } = useLang();
  const { audit } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const counts = React.useMemo(() => {
    const base: Record<string, number> = { ALL: audit.length };
    for (const t of ORDER) base[t] = audit.filter((a) => a.entityType === t).length;
    return base;
  }, [audit]);

  const stats = React.useMemo(() => {
    const weekAgo = NOW.getTime() - 7 * 86400000;
    const dayAgo = NOW.getTime() - 86400000;
    const recent = audit.filter((a) => new Date(a.createdAt).getTime() >= weekAgo);
    const actors = new Set(audit.map((a) => a.actor));
    const tally = new Map<string, number>();
    for (const a of audit) tally.set(a.action, (tally.get(a.action) ?? 0) + 1);
    const top = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
    return {
      today: audit.filter((a) => new Date(a.createdAt).getTime() >= dayAgo).length,
      week: recent.length,
      actors: actors.size,
      topAction: top ? actionLabel(top[0]) : "—",
      topCount: top?.[1] ?? 0,
    };
  }, [audit]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return audit
      .filter((a) => (filter === "ALL" ? true : a.entityType === filter))
      .filter((a) => {
        if (!needle) return true;
        return (
          a.actor.toLowerCase().includes(needle) ||
          a.actorRole.toLowerCase().includes(needle) ||
          a.action.toLowerCase().includes(needle) ||
          a.entityLabel.toLowerCase().includes(needle) ||
          a.entityId.toLowerCase().includes(needle) ||
          a.ip.includes(needle)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [audit, filter, q]);

  /* Group into days so a long list stays readable. Each group carries the
     timestamp of its first entry, so the heading never has to reach back into
     `entries[0]` and hope it is there. */
  const days = React.useMemo(() => {
    const out: { key: string; date: string; entries: AuditEntry[] }[] = [];
    for (const a of rows) {
      const k = dayKey(a.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === k) last.entries.push(a);
      else out.push({ key: k, date: a.createdAt, entries: [a] });
    }
    return out;
  }, [rows]);

  const open = openId ? (audit.find((a) => a.id === openId) ?? null) : null;

  return (
    <>
      <PageHeader
        icon={<History className="h-5 w-5" />}
        title={lang === "np" ? "अभिलेख (Audit log)" : "Audit log"}
        subtitle={
          lang === "np"
            ? "कसले, कहिले, के परिवर्तन गर्यो — मेटाउन मिल्दैन"
            : "Every decision on this console, with the name behind it. Entries are written once and never edited."
        }
        actions={
          <Badge tone="ink" dot={false}>
            <Fingerprint className="h-3.5 w-3.5" /> {num(audit.length)} entries
          </Badge>
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Last 24 hours"
          value={num(stats.today)}
          icon={History}
          tone="crimson"
          hint="Actions recorded today"
        />
        <StatCard
          label="Last 7 days"
          value={num(stats.week)}
          icon={CalendarDays}
          tone="blue"
          hint="Rolling week"
        />
        <StatCard
          label="People acting"
          value={num(stats.actors)}
          icon={Users}
          tone="green"
          hint="Distinct staff in this log"
        />
        <StatCard
          label="Most common"
          value={stats.topAction}
          icon={Globe}
          tone="marigold"
          hint={`${num(stats.topCount)} times`}
        />
      </Reveal>

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "Everything", count: counts.ALL },
            ...ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => ({
              value: t,
              label: ENTITY[t].label,
              count: counts[t] ?? 0,
            })),
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Person, action, record or IP"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-80"
        />
      </div>

      {days.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="Nothing recorded in this view"
          description="Try another area of the platform, or clear the search."
        />
      ) : (
        <Reveal className="space-y-4">
          {days.map((d) => (
            <Card key={d.key} className="pb-3">
              <SectionTitle
                title={fullDate(d.date)}
                hint={`${num(d.entries.length)} action${d.entries.length === 1 ? "" : "s"} · ${dayMonth(
                  d.date,
                )}`}
              />
              <ul className="mt-3 divide-y divide-ink-100">
                {d.entries.map((a) => {
                  const e = ENTITY[a.entityType];
                  const EIcon = e.icon;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(a.id)}
                        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-ink-50"
                      >
                        <span
                          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${e.chip}`}
                          aria-hidden
                        >
                          <EIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink-900">
                              {actionLabel(a.action)}
                            </span>
                            <span className="font-mono text-[0.68rem] text-ink-400">
                              {a.action}
                            </span>
                            <span className="ml-auto shrink-0 text-xs text-ink-400">
                              {ago(a.createdAt, NOW)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-ink-700">
                            {a.entityLabel}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                            <Avatar name={a.actor} tone="ink" size={20} />
                            <span className="font-semibold text-ink-700">{a.actor}</span>
                            <span className="text-ink-400">· {a.actorRole}</span>
                            {a.before && a.after && (
                              <span className="flex items-center gap-1.5 rounded-full bg-ink-50 px-2 py-0.5 font-mono text-[0.68rem]">
                                <span className="text-ink-500">{a.before}</span>
                                <ArrowRight className="h-3 w-3 text-ink-400" />
                                <span className="font-bold text-ink-800">{a.after}</span>
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </Reveal>
      )}

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? actionLabel(open.action) : "Entry"}
        subtitle={open ? `${open.entityLabel} · ${ago(open.createdAt, NOW)}` : undefined}
        width={520}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-500">This entry cannot be changed or removed.</span>
            <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>
              Close
            </Button>
          </div>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-3.5 py-3">
              <Avatar name={open.actor} tone="crimson" size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{open.actor}</p>
                <p className="text-xs text-ink-500">{open.actorRole}</p>
              </div>
            </div>

            {open.before || open.after ? (
              <div className="rounded-xl border border-ink-100">
                <p className="border-b border-ink-100 bg-ink-50/60 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  What changed
                </p>
                <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-ink-50 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Before
                    </p>
                    <p className="mt-1 break-words font-mono text-xs text-ink-700">
                      {open.before ?? "did not exist"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#EAF7EF] px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#0B7E58]">
                      After
                    </p>
                    <p className="mt-1 break-words font-mono text-xs text-ink-800">
                      {open.after ?? "removed"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-600">
                This action did not change a stored value — it was a read, a message, or a
                notification.
              </p>
            )}

            <div className="divide-y divide-ink-100">
              <KeyValue label="Action key">
                <span className="font-mono text-xs">{open.action}</span>
              </KeyValue>
              <KeyValue label="Record">{ENTITY[open.entityType].label}</KeyValue>
              <KeyValue label="Record id">
                <span className="font-mono text-xs">{open.entityId}</span>
              </KeyValue>
              <KeyValue label="Label">{open.entityLabel}</KeyValue>
              <KeyValue label="Surface">{open.surface}</KeyValue>
              <KeyValue label="IP address">
                <span className="font-mono text-xs">{open.ip}</span>
              </KeyValue>
              <KeyValue label="When">{fullDate(open.createdAt)}</KeyValue>
            </div>
          </div>
        )}
      </Drawer>


      <p className="mt-6 text-xs text-ink-400">
        The audit log is append-only. Nobody on the platform — including a Super Admin — can edit or
        remove an entry once it is written.
      </p>
    </>
  );
}


