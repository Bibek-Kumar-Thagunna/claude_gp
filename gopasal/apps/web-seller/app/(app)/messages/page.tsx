"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCheck, CircleCheck, LockKeyhole, MessageCircle, Send, ShoppingBag, UserRound } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader } from "@/components/primitives";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { cn } from "@/lib/cn";
import { sellerMessagesApi, type ShopConversation } from "@/lib/api/messages";

function time(value: string) {
  return new Intl.DateTimeFormat("en-NP", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function MessagesPage() {
  return (
    <PermissionGate perm="messages.view">
      <React.Suspense fallback={<p className="text-sm text-ink-500">Opening conversations…</p>}>
        <MessagesInner />
      </React.Suspense>
    </PermissionGate>
  );
}

function MessagesInner() {
  const params = useSearchParams();
  const targetShopId = params.get("shopId");
  const targetOrderId = params.get("orderId");
  const { canInShop } = useAuth();
  const { scopedShopIds, shopById } = useShops();
  const readableShopIds = React.useMemo(
    () => scopedShopIds.filter((id) => canInShop(id, "messages.view")),
    [canInShop, scopedShopIds],
  );
  const readableKey = readableShopIds.join(",");
  const [rows, setRows] = React.useState<ShopConversation[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ShopConversation | null>(null);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [closing, setClosing] = React.useState(false);

  const loadList = React.useCallback(async (signal?: AbortSignal) => {
    const ids = readableKey.split(",").filter(Boolean);
    const pages = await Promise.all(ids.map((id) => sellerMessagesApi.list(id, 1, signal)));
    if (signal?.aborted) return;
    const all = pages.flatMap((page) => page.data).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    setRows(all);
    setSelectedId((current) => {
      if (current && all.some((row) => row.id === current)) return current;
      const target = all.find((row) => targetOrderId ? row.orderId === targetOrderId : false);
      return target?.id ?? (targetOrderId ? null : all[0]?.id ?? null);
    });
  }, [readableKey, targetOrderId]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void loadList(controller.signal)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load conversations"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = window.setInterval(() => void loadList().catch(() => undefined), 8_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadList]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const detailShopId = selected?.shopId ?? detail?.shopId ?? null;
  const loadDetail = React.useCallback(async (shopId: string, id: string, signal?: AbortSignal) => {
    const row = await sellerMessagesApi.detail(shopId, id, signal);
    if (signal?.aborted) return;
    setDetail(row);
    await sellerMessagesApi.markRead(shopId, id).catch(() => undefined);
    setRows((current) => current.map((item) => item.id === id ? { ...item, hasUnread: false } : item));
  }, []);

  React.useEffect(() => {
    if (!selectedId || !detailShopId) { setDetail(null); return; }
    const controller = new AbortController();
    void loadDetail(detailShopId, selectedId, controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open conversation");
    });
    const timer = window.setInterval(() => void loadDetail(detailShopId, selectedId).catch(() => undefined), 5_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [detailShopId, loadDetail, selectedId]);

  const newShopId = targetShopId && readableShopIds.includes(targetShopId) ? targetShopId : null;
  const mayRespond = Boolean((detailShopId && canInShop(detailShopId, "messages.respond")) || (newShopId && canInShop(newShopId, "messages.respond")));

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || !mayRespond) return;
    setSending(true);
    setError(null);
    try {
      if (selectedId && detailShopId) {
        await sellerMessagesApi.send(detailShopId, selectedId, body);
        setDraft("");
        await Promise.all([loadDetail(detailShopId, selectedId), loadList()]);
      } else if (newShopId && targetOrderId) {
        const message = await sellerMessagesApi.startForOrder(newShopId, targetOrderId, body);
        setDraft("");
        setSelectedId(message.conversationId);
        await loadList();
      } else {
        setError("A shop may start a conversation only from a real customer order.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message was not sent");
    } finally {
      setSending(false);
    }
  }

  /**
   * Closing a thread.
   *
   * `PATCH …/conversations/:id/close` has existed since messaging shipped and
   * nothing called it, so a shop's inbox only ever grew: every question ever
   * asked stayed in the list at the same weight as the one from ten minutes ago.
   * Closed is not deleted — the thread and its history stay, it stops being
   * something the shop is expected to answer.
   */
  const closed = (detail ?? selected)?.status === "CLOSED";
  async function closeConversation() {
    if (!selectedId || !detailShopId || closing || closed) return;
    setClosing(true);
    setError(null);
    try {
      await sellerMessagesApi.close(detailShopId, selectedId);
      await Promise.all([loadDetail(detailShopId, selectedId), loadList()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not close this conversation");
    } finally {
      setClosing(false);
    }
  }

  const heading = detail?.customer.name || selected?.customer.name || "Customer";
  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Private customer questions and order conversations"
        icon={<MessageCircle className="h-5 w-5" />}
        actions={<span className="hidden items-center gap-1.5 text-xs text-ink-500 sm:flex"><LockKeyhole className="h-3.5 w-3.5" /> Shop RBAC protected</span>}
      />
      <div className="grid h-[calc(100dvh-180px)] min-h-[520px] overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className={cn("border-ink-100 md:border-r", selectedId || targetOrderId ? "hidden md:block" : "block")}>
          <div className="border-b border-ink-100 px-5 py-4"><h2 className="font-bold text-ink-900">Inbox</h2><p className="text-xs text-ink-500">{rows.filter((row) => row.hasUnread).length} unread · {rows.length} conversations</p></div>
          <div className="max-h-[720px] overflow-y-auto">
            {loading ? <p className="p-5 text-sm text-ink-500">Loading conversations…</p> : rows.length === 0 ? <EmptyInbox /> : rows.map((row) => (
              <button key={row.id} onClick={() => setSelectedId(row.id)} className={cn("flex w-full gap-3 border-b border-ink-100 p-4 text-left transition hover:bg-crimson-50/50", selectedId === row.id && "bg-crimson-50")}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 font-bold text-ink-600">{(row.customer.name || "C").slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-ink-900">{row.customer.name || "Customer"}</strong>{row.hasUnread && <span className="h-2.5 w-2.5 rounded-full bg-crimson-500" />}</span><span className="block truncate text-[11px] font-semibold text-crimson-600">{row.shop.name}{row.order ? ` · ${row.order.code}` : " · Before order"}</span><span className="mt-1 block truncate text-xs text-ink-500">{row.lastMessage?.body ?? "Conversation started"}</span><span className="mt-1 block text-[11px] text-ink-400">{time(row.lastMessageAt)}</span></span>
              </button>
            ))}
          </div>
        </aside>

        <section className={cn("flex min-w-0 flex-col", !selectedId && !targetOrderId ? "hidden md:flex" : "flex")}>
          <div className="flex min-h-[74px] items-center gap-3 border-b border-ink-100 px-4 py-3 sm:px-5">
            <button onClick={() => { setSelectedId(null); setDetail(null); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink-100 md:hidden" aria-label="Back to inbox"><ArrowLeft className="h-5 w-5" /></button>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-crimson-50 text-crimson-600"><UserRound className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="truncate font-bold text-ink-900">{heading}</h2><p className="truncate text-xs text-ink-500">{detail?.order ? `${detail.order.code} · ${detail.shop.name}` : targetOrderId ? `Order conversation · ${shopById(newShopId ?? "")?.name ?? "Shop"}` : detail ? `Pre-order question · ${detail.shop.name}` : "Select a conversation"}</p></div>
            {selectedId && mayRespond && (
              closed ? (
                <span className="hidden items-center gap-1 rounded-full bg-ink-100 px-3 py-2 text-xs font-bold text-ink-600 sm:flex">
                  <CheckCheck className="h-3.5 w-3.5" /> Closed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void closeConversation()}
                  disabled={closing}
                  className="hidden items-center gap-1 rounded-full border border-ink-200 px-3 py-2 text-xs font-bold text-ink-700 hover:bg-ink-50 disabled:opacity-50 sm:flex"
                >
                  <CircleCheck className="h-3.5 w-3.5" /> {closing ? "Closing…" : "Mark resolved"}
                </button>
              )
            )}
            {detail?.order && <a href={`/orders/${detail.order.id}?shop=${detail.shopId}`} className="hidden items-center gap-1 rounded-full border border-ink-200 px-3 py-2 text-xs font-bold text-ink-700 hover:bg-ink-50 sm:flex"><ShoppingBag className="h-3.5 w-3.5" /> Open order</a>}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#FCFAFA] p-4 sm:p-6" aria-live="polite">
            {!selectedId && targetOrderId ? <div className="mx-auto mt-10 max-w-md rounded-2xl border border-crimson-100 bg-white p-5 text-center"><MessageCircle className="mx-auto h-8 w-8 text-crimson-500" /><h3 className="mt-3 font-bold text-ink-900">Message this customer about their order</h3><p className="mt-1 text-sm text-ink-600">Use this for substitutions, address clarification or a delivery update. The conversation remains attached to the order.</p></div> : null}
            {detail?.messages?.map((message) => {
              const mine = message.sender === "SHOP";
              return <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm", mine ? "rounded-br-md bg-crimson-500 text-white" : "rounded-bl-md border border-ink-100 bg-white text-ink-800")}><p className="whitespace-pre-wrap break-words">{message.body}</p><span className={cn("mt-1.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/75" : "text-ink-400")}>{time(message.createdAt)}{mine && <CheckCheck className="h-3 w-3" />}</span></div></div>;
            })}
          </div>
          <form onSubmit={send} className="border-t border-ink-100 bg-white p-3 sm:p-4">
            {error && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {/* Only about a conversation that is actually open: with nothing
                selected this used to tell an Owner their role could not reply,
                which is both wrong and alarming. */}
            {(selectedId || targetOrderId) && !mayRespond ? <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Your role can read this conversation but cannot reply.</p> : closed ? <p className="mb-2 rounded-xl bg-ink-100 px-3 py-2 text-sm text-ink-600">This conversation is closed. Sending a reply reopens it for the customer.</p> : null}
            <div className="flex items-end gap-2"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={!mayRespond} rows={1} maxLength={2000} placeholder="Write a helpful reply…" className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-ink-200 px-4 py-3 text-sm outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-50 disabled:bg-ink-50" /><button disabled={sending || !draft.trim() || !mayRespond} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-500 text-white shadow-crimson transition hover:bg-crimson-600 disabled:opacity-40" aria-label="Send reply"><Send className="h-5 w-5" /></button></div>
            <p className="mt-2 text-center text-[11px] text-ink-400">Never ask a customer for an OTP, password or wallet PIN.</p>
          </form>
        </section>
      </div>
    </div>
  );
}

function EmptyInbox() {
  return <div className="p-8 text-center"><MessageCircle className="mx-auto h-9 w-9 text-ink-300" /><p className="mt-3 font-semibold text-ink-800">No conversations yet</p><p className="mt-1 text-sm text-ink-500">Customers can start a chat from your shop. You can start one from a placed order.</p></div>;
}
