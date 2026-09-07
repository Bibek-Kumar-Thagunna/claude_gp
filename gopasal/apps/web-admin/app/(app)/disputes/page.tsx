"use client";

import * as React from "react";
import Link from "next/link";
import {
  Scale,
  Search,
  Store,
  User,
  Wallet,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Eye,
  Phone,
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
  Avatar,
} from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type DisputeStatus } from "@/lib/data";
import { rs, num, ago, fullDate, phone as fmtPhone } from "@/lib/format";

type Filter = "OPEN_ALL" | DisputeStatus | "ALL";

const ROLE_STYLE: Record<string, string> = {
  customer: "bg-[#EAF1FE] text-[#1D4ED8]",
  shop: "bg-[#FFF3DF] text-[#8a5a00]",
  platform: "bg-crimson-50 text-crimson-700",
};

export default function DisputesPage() {
  return (
    <PermissionGate perm="disputes.view">
      <DisputesInner />
    </PermissionGate>
  );
}

function DisputesInner() {
  const { lang } = useLang();
  const { disputes, resolveDispute } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("OPEN_ALL");
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<DisputeStatus | null>(null);

  const counts = React.useMemo(
    () => ({
      ALL: disputes.length,
      OPEN_ALL: disputes.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW").length,
      OPEN: disputes.filter((d) => d.status === "OPEN").length,
      UNDER_REVIEW: disputes.filter((d) => d.status === "UNDER_REVIEW").length,
      RESOLVED_CUSTOMER: disputes.filter((d) => d.status === "RESOLVED_CUSTOMER").length,
      RESOLVED_SHOP: disputes.filter((d) => d.status === "RESOLVED_SHOP").length,
      REJECTED: disputes.filter((d) => d.status === "REJECTED").length,
    }),
    [disputes],
  );

  /* Money still at stake across everything undecided. */
  const atStake = React.useMemo(
    () =>
      disputes
        .filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW")
        .reduce((s, d) => s + d.claimAmount, 0),
    [disputes],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return disputes
      .filter((d) => {
        if (filter === "ALL") return true;
        if (filter === "OPEN_ALL") return d.status === "OPEN" || d.status === "UNDER_REVIEW";
        return d.status === filter;
      })
      .filter((d) => {
        if (!needle) return true;
        return (
          d.orderCode.toLowerCase().includes(needle) ||
          d.customerName.toLowerCase().includes(needle) ||
          d.customerPhone.includes(needle) ||
          d.shopName.toLowerCase().includes(needle) ||
          d.reason.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [disputes, filter, q]);

  /* Keep a valid selection while filters and searches move the list around. */
  const open = rows.find((d) => d.id === selectedId) ?? rows[0] ?? null;

  React.useEffect(() => {
    if (open && open.id !== selectedId) setSelectedId(open.id);
  }, [open, selectedId]);

  const decided = open
    ? open.status === "RESOLVED_CUSTOMER" ||
      open.status === "RESOLVED_SHOP" ||
      open.status === "REJECTED"
    : false;

  const DIALOG: Record<
    DisputeStatus,
    { title: string; description: string; confirmLabel: string; destructive: boolean }
  > = {
    UNDER_REVIEW: {
      title: "Move this claim to review?",
      description:
        "Both sides are told the platform is looking into it. Nothing is refunded yet and the order stays as it is.",
      confirmLabel: "Move to review",
      destructive: false,
    },
    RESOLVED_CUSTOMER: {
      title: `Refund ${rs(open?.claimAmount ?? 0)} to the customer?`,
      description:
        "The claim is upheld. The amount is credited back to the customer and deducted from the shop’s next payout.",
      confirmLabel: "Refund customer",
      destructive: false,
    },
    RESOLVED_SHOP: {
      title: "Decide in favour of the shop?",
      description:
        "The claim is closed with no refund. The customer is told why, and the shop keeps the full order value.",
      confirmLabel: "Side with the shop",
      destructive: false,
    },
    REJECTED: {
      title: "Reject this claim?",
      description:
        "Use this when the claim is not genuine. It is closed with no refund and counts against the customer’s account.",
      confirmLabel: "Reject claim",
      destructive: true,
    },
    OPEN: {
      title: "Reopen this claim?",
      description: "The claim goes back into the queue for a fresh decision.",
      confirmLabel: "Reopen",
      destructive: false,
    },
  };

  const copy = DIALOG[pending ?? "UNDER_REVIEW"];

  return (
    <>
      <PageHeader
        icon={<Scale className="h-5 w-5" />}
        title={lang === "np" ? "विवाद समाधान" : "Disputes"}
        subtitle={
          lang === "np"
            ? "ग्राहक र पसलबीचको दावी — दुवै पक्षको भनाई पढेर मात्र निर्णय गर्नुहोस्"
            : "Customer against shop. Read both sides, then decide who the money belongs to."
        }
        actions={
          atStake > 0 ? (
            <Badge tone="red" dot>
              {rs(atStake)} at stake
            </Badge>
          ) : (
            <Badge tone="green" dot>
              Nothing open
            </Badge>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "OPEN_ALL", label: "Needs a decision", count: counts.OPEN_ALL },
            { value: "OPEN", label: "New", count: counts.OPEN },
            { value: "UNDER_REVIEW", label: "In review", count: counts.UNDER_REVIEW },
            { value: "RESOLVED_CUSTOMER", label: "Refunded", count: counts.RESOLVED_CUSTOMER },
            { value: "RESOLVED_SHOP", label: "Shop won", count: counts.RESOLVED_SHOP },
            { value: "REJECTED", label: "Rejected", count: counts.REJECTED },
            { value: "ALL", label: "All", count: counts.ALL },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Order code, customer or shop"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No claims in this view"
          description="Nothing matches this filter. New disputes arrive here the moment a customer raises one."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Reveal>
            <Card className="pb-3">
              <SectionTitle title="Claims" hint="Most recently updated first" />
              <ul className="mt-3 divide-y divide-ink-100">
                {rows.map((d) => {
                  const active = open?.id === d.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        aria-current={active}
                        className={
                          active
                            ? "w-full border-l-[3px] border-crimson-500 bg-crimson-50/60 px-4 py-3.5 text-left"
                            : "w-full border-l-[3px] border-transparent px-4 py-3.5 text-left transition hover:bg-ink-50"
                        }
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-ink-600">
                            {d.orderCode}
                          </span>
                          <StatusBadge value={d.status} />
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-ink-900">
                          {d.reason}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-ink-500">
                            {d.customerName} · {d.shopName}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-ink-700">
                            {rs(d.claimAmount)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-400">
                          {ago(d.updatedAt, NOW)} · {num(d.notes.length)} message
                          {d.notes.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Reveal>

          {open && (
            <Reveal delay={0.06}>
              <Card className="pb-5">
                <SectionTitle
                  title={open.reason}
                  hint={`${open.orderCode} · raised ${fullDate(open.createdAt)}`}
                  action={<StatusBadge value={open.status} />}
                />

                <div className="px-5 pt-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        <Wallet className="h-3.5 w-3.5" /> Claimed
                      </p>
                      <p className="mt-1 text-lg font-bold text-ink-900">{rs(open.claimAmount)}</p>
                      <p className="text-xs text-ink-500">of {rs(open.orderTotal)} order</p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        <User className="h-3.5 w-3.5" /> Customer
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-ink-900">
                        {open.customerName}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-ink-500">
                        <Phone className="h-3 w-3" /> {fmtPhone(open.customerPhone)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        <Store className="h-3.5 w-3.5" /> Shop
                      </p>
                      <Link
                        href={`/shops/${open.shopId}`}
                        className="mt-1 block truncate text-sm font-bold text-crimson-700 hover:underline"
                      >
                        {open.shopName}
                      </Link>
                      <p className="text-xs text-ink-500">Open the shop record</p>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-ink-700">{open.detail}</p>

                  <p className="mt-6 flex items-center gap-2 text-sm font-bold text-ink-900">
                    <MessageSquare className="h-4 w-4 text-ink-400" /> What both sides said
                  </p>
                  <ol className="mt-3 space-y-3">
                    {open.notes.map((n, i) => (
                      <li
                        key={`${n.at}-${i}`}
                        className="rounded-xl border border-ink-100 px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Avatar
                            name={n.author}
                            tone={n.role === "platform" ? "crimson" : n.role === "shop" ? "marigold" : "blue"}
                            size={28}
                          />
                          <span className="text-sm font-semibold text-ink-900">{n.author}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide ${
                              ROLE_STYLE[n.role] ?? ROLE_STYLE.platform
                            }`}
                          >
                            {n.role}
                          </span>
                          <span className="ml-auto text-xs text-ink-400">{ago(n.at, NOW)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-ink-700">{n.body}</p>
                      </li>
                    ))}
                  </ol>

                  {decided && open.resolution && (
                    <div className="mt-5 rounded-xl border border-[#BFE5D2] bg-[#EAF7EF] px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#0B7E58]">
                        <ShieldCheck className="h-3.5 w-3.5" /> Decision recorded
                      </p>
                      <p className="mt-1 text-sm text-ink-800">{open.resolution}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        {open.resolvedBy ? `${open.resolvedBy} · ` : ""}
                        {ago(open.updatedAt, NOW)}
                      </p>
                    </div>
                  )}

                  <Can perm="disputes.resolve">
                    <div className="mt-6 border-t border-ink-100 pt-5">
                      <p className="text-sm font-bold text-ink-900">
                        {decided ? "Change the decision" : "Decide this claim"}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        Every outcome needs a written reason. It is shown to both sides and kept in
                        the audit log under your name.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {open.status === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPending("UNDER_REVIEW")}
                          >
                            <Eye className="h-4 w-4" /> Move to review
                          </Button>
                        )}
                        <Button size="sm" onClick={() => setPending("RESOLVED_CUSTOMER")}>
                          <CheckCircle2 className="h-4 w-4" /> Refund {rs(open.claimAmount)}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPending("RESOLVED_SHOP")}
                        >
                          <Store className="h-4 w-4" /> Shop keeps it
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setPending("REJECTED")}>
                          <XCircle className="h-4 w-4" /> Reject claim
                        </Button>
                      </div>
                    </div>
                  </Can>

                </div>
              </Card>
            </Reveal>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (open && pending) resolveDispute(open.id, pending, reason ?? "");
          setPending(null);
        }}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel}
        destructive={copy.destructive}
        reasonLabel="Reason shown to the customer and the shop"
        reasonRequired
      />

      <p className="mt-6 text-xs text-ink-400">
        Refunds settle against the shop’s next payout. GoPasal never charges a shop for a claim it
        wins.
      </p>
    </>
  );
}

