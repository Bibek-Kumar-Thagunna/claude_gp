"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Search,
  User,
  Store,
  ShoppingBag,
  Radar,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldCheck,
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
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type FraudStatus, type FraudSeverity } from "@/lib/data";
import { num, ago, fullDate } from "@/lib/format";

type Filter = "OPEN_ALL" | FraudStatus | "ALL";

const SEVERITY: Record<
  FraudSeverity,
  { label: string; tone: "red" | "marigold" | "ink"; bar: string }
> = {
  high: { label: "High risk", tone: "red", bar: "bg-[#c02636]" },
  medium: { label: "Medium", tone: "marigold", bar: "bg-[#F6A609]" },
  low: { label: "Low", tone: "ink", bar: "bg-ink-300" },
};

const SUBJECT = {
  user: { label: "Account", icon: User, chip: "bg-[#EAF1FE] text-[#1D4ED8]" },
  shop: { label: "Shop", icon: Store, chip: "bg-[#FFF3DF] text-[#8a5a00]" },
  order: { label: "Order", icon: ShoppingBag, chip: "bg-crimson-50 text-crimson-700" },
} as const;

export default function FraudPage() {
  return (
    <PermissionGate
      perm="fraud.view"
      title="You can’t see fraud signals"
      description="This queue holds account-level risk data. It needs the “View fraud signals” permission."
    >
      <FraudInner />
    </PermissionGate>
  );
}

function FraudInner() {
  const { lang } = useLang();
  const { fraud, users, shops, setFraudStatus } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("OPEN_ALL");
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<{ id: string; to: FraudStatus } | null>(null);

  const counts = React.useMemo(
    () => ({
      ALL: fraud.length,
      OPEN_ALL: fraud.filter((f) => f.status === "OPEN" || f.status === "REVIEWING").length,
      OPEN: fraud.filter((f) => f.status === "OPEN").length,
      REVIEWING: fraud.filter((f) => f.status === "REVIEWING").length,
      CONFIRMED: fraud.filter((f) => f.status === "CONFIRMED").length,
      DISMISSED: fraud.filter((f) => f.status === "DISMISSED").length,
      HIGH: fraud.filter((f) => f.severity === "high").length,
    }),
    [fraud],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const order: Record<FraudSeverity, number> = { high: 0, medium: 1, low: 2 };
    return fraud
      .filter((f) => {
        if (filter === "ALL") return true;
        if (filter === "OPEN_ALL") return f.status === "OPEN" || f.status === "REVIEWING";
        return f.status === filter;
      })
      .filter((f) => {
        if (!needle) return true;
        return (
          f.subjectLabel.toLowerCase().includes(needle) ||
          f.reason.toLowerCase().includes(needle) ||
          f.detail.toLowerCase().includes(needle) ||
          f.signals.some((s) => s.toLowerCase().includes(needle))
        );
      })
      .sort(
        (a, b) =>
          order[a.severity] - order[b.severity] ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [fraud, filter, q]);

  /* Deep-link a flag to the record it is about, where such a record exists. */
  const linkFor = (subjectType: "user" | "shop" | "order", subjectId: string) => {
    if (subjectType === "shop") {
      return shops.some((s) => s.id === subjectId) ? `/shops/${subjectId}` : null;
    }
    if (subjectType === "user") {
      const u = users.find((x) => x.id === subjectId);
      return u ? `/users?q=${u.phone}` : null;
    }
    return null;
  };

  const target = pending ? fraud.find((f) => f.id === pending.id) : null;

  const DIALOG: Record<
    FraudStatus,
    { title: string; description: string; confirmLabel: string; destructive: boolean }
  > = {
    OPEN: {
      title: "Reopen this signal?",
      description: "The signal returns to the queue for a fresh look.",
      confirmLabel: "Reopen",
      destructive: false,
    },
    REVIEWING: {
      title: "Take this signal for review?",
      description:
        "It is marked as being looked at, so two people don’t work the same case. Nothing changes for the account yet.",
      confirmLabel: "Start review",
      destructive: false,
    },
    CONFIRMED: {
      title: "Confirm this as fraud?",
      description:
        "The signal is upheld and stays on the record permanently. Suspend the account or shop separately — this does not do it for you.",
      confirmLabel: "Confirm fraud",
      destructive: true,
    },
    DISMISSED: {
      title: "Dismiss this signal?",
      description:
        "The behaviour is judged legitimate. The signal is closed but kept for history, and the risk engine learns from it.",
      confirmLabel: "Dismiss signal",
      destructive: false,
    },
  };

  const copy = DIALOG[pending?.to ?? "REVIEWING"];

  return (
    <>
      <PageHeader
        icon={<ShieldAlert className="h-5 w-5" />}
        title={lang === "np" ? "जोखिम संकेत" : "Fraud signals"}
        subtitle={
          lang === "np"
            ? "जोखिम इन्जिनले उठाएका खाता, पसल र अर्डरहरू — मानिसले जाँचेपछि मात्र कारबाही"
            : "Accounts, shops and orders the risk engine flagged. A person decides — never the engine alone."
        }
        actions={
          counts.OPEN_ALL > 0 ? (
            <Badge tone="red" dot>
              {num(counts.OPEN_ALL)} to work through
            </Badge>
          ) : (
            <Badge tone="green" dot>
              Queue clear
            </Badge>
          )
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting a person"
          value={num(counts.OPEN_ALL)}
          icon={Radar}
          tone={counts.OPEN_ALL ? "crimson" : "ink"}
          hint="New and in review"
        />
        <StatCard
          label="High risk"
          value={num(counts.HIGH)}
          icon={ShieldAlert}
          tone={counts.HIGH ? "red" : "ink"}
          hint="Across every status"
        />
        <StatCard
          label="Confirmed fraud"
          value={num(counts.CONFIRMED)}
          icon={CheckCircle2}
          tone="marigold"
          hint="Kept on the record"
        />
        <StatCard
          label="Dismissed"
          value={num(counts.DISMISSED)}
          icon={ShieldCheck}
          tone="green"
          hint="Judged legitimate"
        />
      </Reveal>

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "OPEN_ALL", label: "Needs a look", count: counts.OPEN_ALL },
            { value: "OPEN", label: "New", count: counts.OPEN },
            { value: "REVIEWING", label: "In review", count: counts.REVIEWING },
            { value: "CONFIRMED", label: "Confirmed", count: counts.CONFIRMED },
            { value: "DISMISSED", label: "Dismissed", count: counts.DISMISSED },
            { value: "ALL", label: "All", count: counts.ALL },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Account, shop, order or signal"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Nothing flagged in this view"
          description="No signal matches this filter. The risk engine posts new ones here as they trip."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((f, i) => {
            const sev = SEVERITY[f.severity];
            const subj = SUBJECT[f.subjectType];
            const SubjIcon = subj.icon;
            const href = linkFor(f.subjectType, f.subjectId);
            const settled = f.status === "CONFIRMED" || f.status === "DISMISSED";
            return (
              <Reveal key={f.id} delay={i * 0.04}>
                <Card className="relative h-full overflow-hidden pb-5">
                  <span className={`absolute inset-y-0 left-0 w-1 ${sev.bar}`} aria-hidden />
                  <SectionTitle
                    title={f.reason}
                    hint={`Raised by ${f.reporter} · ${fullDate(f.createdAt)}`}
                    action={
                      <span className="flex items-center gap-2">
                        <Badge tone={sev.tone} dot>
                          {sev.label}
                        </Badge>
                        <StatusBadge value={f.status} />
                      </span>
                    }
                  />

                  <div className="px-5 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${subj.chip}`}
                      >
                        <SubjIcon className="h-3.5 w-3.5" /> {subj.label}
                      </span>
                      {href ? (
                        <Link
                          href={href}
                          className="truncate text-sm font-semibold text-crimson-700 hover:underline"
                        >
                          {f.subjectLabel}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-semibold text-ink-900">
                          {f.subjectLabel}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-ink-400">
                        {ago(f.createdAt, NOW)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-ink-700">{f.detail}</p>

                    <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                      <Radar className="h-3.5 w-3.5" /> What the engine matched
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {f.signals.map((s) => (
                        <li
                          key={s}
                          className="rounded-lg bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"
                        >
                          {s}
                        </li>
                      ))}
                    </ul>

                    <Can perm="fraud.manage">
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
                        {f.status === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPending({ id: f.id, to: "REVIEWING" })}
                          >
                            <Eye className="h-4 w-4" /> Start review
                          </Button>
                        )}
                        {settled ? (
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => setPending({ id: f.id, to: "REVIEWING" })}
                          >
                            <Eye className="h-4 w-4" /> Look again
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setPending({ id: f.id, to: "CONFIRMED" })}
                            >
                              <CheckCircle2 className="h-4 w-4" /> Confirm fraud
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPending({ id: f.id, to: "DISMISSED" })}
                            >
                              <XCircle className="h-4 w-4" /> Dismiss
                            </Button>
                          </>
                        )}
                        {f.subjectType !== "order" && href && (
                          <Button href={href} variant="ghost" size="sm">
                            Open {subj.label.toLowerCase()}
                          </Button>
                        )}
                      </div>
                    </Can>
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
          if (pending) setFraudStatus(pending.id, pending.to);
          setPending(null);
        }}
        title={copy.title}
        description={`${target ? `${target.subjectLabel} — ` : ""}${copy.description}`}
        confirmLabel={copy.confirmLabel}
        destructive={copy.destructive}
      />

      <p className="mt-6 text-xs text-ink-400">
        A signal is evidence, not a verdict. Confirming one never suspends an account on its own —
        that is a separate, recorded decision.
      </p>

    </>
  );
}

