"use client";

import * as React from "react";
import Link from "next/link";
import {
  LifeBuoy,
  Search,
  Send,
  Store,
  User,
  Phone,
  ShoppingBag,
  CheckCircle2,
  Inbox,
  Clock,
  Wallet,
  Smartphone,
  UserCog,
  HelpCircle,
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
  inputCls,
} from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type TicketStatus, type TicketPriority } from "@/lib/data";
import { num, ago, fullDate, phone as fmtPhone } from "@/lib/format";

type Filter = "INBOX" | TicketStatus | "URGENT" | "ALL";

const CATEGORY = {
  order: { label: "Order", icon: ShoppingBag },
  payment: { label: "Payment", icon: Wallet },
  account: { label: "Account", icon: UserCog },
  shop: { label: "Shop", icon: Store },
  app: { label: "App", icon: Smartphone },
  other: { label: "Other", icon: HelpCircle },
} as const;

const ROLE_STYLE: Record<string, string> = {
  customer: "bg-[#EAF1FE] text-[#1D4ED8]",
  shop: "bg-[#FFF3DF] text-[#8a5a00]",
  platform: "bg-crimson-50 text-crimson-700",
};

const STATUSES: TicketStatus[] = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];
const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export default function SupportPage() {
  return (
    <PermissionGate perm="support.view">
      <SupportInner />
    </PermissionGate>
  );
}

function SupportInner() {
  const { lang } = useLang();
  const { tickets, shops, replyToTicket, setTicketStatus, setTicketPriority, can } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("INBOX");
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const counts = React.useMemo(
    () => ({
      ALL: tickets.length,
      INBOX: tickets.filter((t) => t.status === "OPEN" || t.status === "PENDING").length,
      OPEN: tickets.filter((t) => t.status === "OPEN").length,
      PENDING: tickets.filter((t) => t.status === "PENDING").length,
      RESOLVED: tickets.filter((t) => t.status === "RESOLVED").length,
      CLOSED: tickets.filter((t) => t.status === "CLOSED").length,
      URGENT: tickets.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").length,
    }),
    [tickets],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank: Record<TicketPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return tickets
      .filter((t) => {
        if (filter === "ALL") return true;
        if (filter === "INBOX") return t.status === "OPEN" || t.status === "PENDING";
        if (filter === "URGENT") return t.priority === "URGENT" || t.priority === "HIGH";
        return t.status === filter;
      })
      .filter((t) => {
        if (!needle) return true;
        return (
          t.code.toLowerCase().includes(needle) ||
          t.subject.toLowerCase().includes(needle) ||
          t.requesterName.toLowerCase().includes(needle) ||
          t.requesterPhone.includes(needle) ||
          (t.orderCode ?? "").toLowerCase().includes(needle) ||
          (t.shopName ?? "").toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          rank[a.priority] - rank[b.priority] ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [tickets, filter, q]);

  /* Selection survives filtering, searching and status changes. */
  const open = rows.find((t) => t.id === selectedId) ?? rows[0] ?? null;

  React.useEffect(() => {
    if (open && open.id !== selectedId) {
      setSelectedId(open.id);
      setDraft("");
    }
  }, [open, selectedId]);

  const openShop = open?.shopName ? shops.find((s) => s.name === open.shopName) : undefined;
  const canRespond = can("support.respond");

  const send = () => {
    const body = draft.trim();
    if (!open || body.length < 2) return;
    replyToTicket(open.id, body);
    setDraft("");
  };

  return (
    <>
      <PageHeader
        icon={<LifeBuoy className="h-5 w-5" />}
        title={lang === "np" ? "सहयोग कक्ष" : "Support inbox"}
        subtitle={
          lang === "np"
            ? "ग्राहक र पसलका प्रश्नहरू — एउटै ठाउँबाट जवाफ दिनुहोस्"
            : "Questions from customers and shopkeepers, answered from one place"
        }
        actions={
          <>
            {counts.URGENT > 0 && (
              <Badge tone="red" dot>
                {num(counts.URGENT)} high or urgent
              </Badge>
            )}
            <Badge tone={counts.INBOX ? "marigold" : "green"} dot>
              {counts.INBOX ? `${num(counts.INBOX)} in the inbox` : "Inbox clear"}
            </Badge>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "INBOX", label: "Inbox", count: counts.INBOX },
            { value: "URGENT", label: "Urgent", count: counts.URGENT },
            { value: "OPEN", label: "New", count: counts.OPEN },
            { value: "PENDING", label: "Waiting", count: counts.PENDING },
            { value: "RESOLVED", label: "Resolved", count: counts.RESOLVED },
            { value: "CLOSED", label: "Closed", count: counts.CLOSED },
            { value: "ALL", label: "All", count: counts.ALL },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Ticket, person, order or shop"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="No tickets in this view"
          description="Nothing matches this filter. New tickets land here as soon as someone writes in."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Reveal>
            <Card className="pb-3">
              <SectionTitle title="Tickets" hint="Urgent first, then most recent" />
              <ul className="mt-3 divide-y divide-ink-100">
                {rows.map((t) => {
                  const active = open?.id === t.id;
                  const cat = CATEGORY[t.category] ?? CATEGORY.other;
                  const CatIcon = cat.icon;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        aria-current={active}
                        className={
                          active
                            ? "w-full border-l-[3px] border-crimson-500 bg-crimson-50/60 px-4 py-3.5 text-left"
                            : "w-full border-l-[3px] border-transparent px-4 py-3.5 text-left transition hover:bg-ink-50"
                        }
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-ink-600">
                            {t.code}
                          </span>
                          <StatusBadge value={t.priority} />
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-ink-900">
                          {t.subject}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                          <CatIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {t.requesterName} · {cat.label}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <StatusBadge value={t.status} />
                          <span className="shrink-0 text-xs text-ink-400">
                            {ago(t.updatedAt, NOW)}
                          </span>
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
                  title={open.subject}
                  hint={`${open.code} · opened ${fullDate(open.createdAt)}${
                    open.assignee ? ` · with ${open.assignee}` : " · unassigned"
                  }`}
                  action={
                    <span className="flex items-center gap-2">
                      <StatusBadge value={open.priority} />
                      <StatusBadge value={open.status} />
                    </span>
                  }
                />

                <div className="px-5 pt-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-ink-50 px-3.5 py-3 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                      {open.requesterKind === "seller" ? (
                        <Store className="h-4 w-4 text-ink-400" />
                      ) : (
                        <User className="h-4 w-4 text-ink-400" />
                      )}
                      {open.requesterName}
                    </span>
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <Phone className="h-3.5 w-3.5 text-ink-400" />
                      {fmtPhone(open.requesterPhone)}
                    </span>
                    {open.orderCode && (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-ink-600">
                        <ShoppingBag className="h-3.5 w-3.5 text-ink-400" />
                        {open.orderCode}
                      </span>
                    )}
                    {open.shopName &&
                      (openShop ? (
                        <Link
                          href={`/shops/${openShop.id}`}
                          className="flex items-center gap-1.5 font-semibold text-crimson-700 hover:underline"
                        >
                          <Store className="h-3.5 w-3.5" />
                          {open.shopName}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1.5 text-ink-600">
                          <Store className="h-3.5 w-3.5 text-ink-400" />
                          {open.shopName}
                        </span>
                      ))}
                  </div>

                  <ol className="mt-5 space-y-3">
                    {open.messages.map((m, i) => {
                      const mine = m.role === "platform";
                      return (
                        <li
                          key={`${m.at}-${i}`}
                          className={mine ? "flex justify-end" : "flex justify-start"}
                        >
                          <div
                            className={
                              mine
                                ? "max-w-[85%] rounded-2xl rounded-br-md border border-crimson-100 bg-crimson-50/70 px-3.5 py-3"
                                : "max-w-[85%] rounded-2xl rounded-bl-md border border-ink-100 bg-white px-3.5 py-3"
                            }
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Avatar
                                name={m.author}
                                tone={
                                  m.role === "platform"
                                    ? "crimson"
                                    : m.role === "shop"
                                      ? "marigold"
                                      : "blue"
                                }
                                size={26}
                              />
                              <span className="text-sm font-semibold text-ink-900">{m.author}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide ${
                                  ROLE_STYLE[m.role] ?? ROLE_STYLE.platform
                                }`}
                              >
                                {m.role}
                              </span>
                              <span className="ml-auto flex items-center gap-1 text-xs text-ink-400">
                                <Clock className="h-3 w-3" />
                                {ago(m.at, NOW)}
                              </span>
                            </div>
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                              {m.body}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <Can
                    perm="support.respond"
                    fallback={
                      <p className="mt-5 rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-500">
                        You can read this ticket but not reply. Replying needs the “Respond to
                        support” permission.
                      </p>
                    }
                  >
                    <div className="mt-5 border-t border-ink-100 pt-5">
                      <label
                        htmlFor="gp-reply"
                        className="text-sm font-bold text-ink-900"
                      >
                        Reply as GoPasal support
                      </label>
                      <textarea
                        id="gp-reply"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            send();
                          }
                        }}
                        rows={4}
                        placeholder="Write plainly. Say what you have done and what happens next — never promise a delivery time."
                        className={`${inputCls} mt-2 resize-y`}
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-ink-400">
                          Ctrl or ⌘ + Enter sends. The reply is signed with your name and role.
                        </p>
                        <Button size="sm" onClick={send} disabled={draft.trim().length < 2}>
                          <Send className="h-4 w-4" /> Send reply
                        </Button>
                      </div>
                    </div>
                  </Can>

                  <Can perm="support.respond">
                    <div className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Status
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setTicketStatus(open.id, s)}
                              aria-pressed={open.status === s}
                              className={
                                open.status === s
                                  ? "rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-bold text-white"
                                  : "rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-200"
                              }
                            >
                              {s === "OPEN"
                                ? "New"
                                : s === "PENDING"
                                  ? "Waiting"
                                  : s === "RESOLVED"
                                    ? "Resolved"
                                    : "Closed"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Priority
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {PRIORITIES.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setTicketPriority(open.id, p)}
                              aria-pressed={open.priority === p}
                              className={
                                open.priority === p
                                  ? "rounded-lg bg-crimson-600 px-3 py-1.5 text-xs font-bold text-white"
                                  : "rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-200"
                              }
                            >
                              {p.charAt(0) + p.slice(1).toLowerCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Can>

                  {!canRespond && open.status === "OPEN" && (
                    <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> This ticket has not been answered yet.
                    </p>
                  )}

                </div>
              </Card>
            </Reveal>
          )}
        </div>
      )}

    </>
  );
}

