"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCheck, LockKeyhole, MessageCircle, Send, ShoppingBag, Store } from "lucide-react";
import { useAuth } from "@/components/providers";
import { customerApi, type ShopConversationWire } from "@/lib/api/customer";
import { cn } from "@/lib/cn";

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en-NP", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function CustomerMessages() {
  const auth = useAuth();
  const params = useSearchParams();
  const targetShopId = params.get("shopId");
  const targetOrderId = params.get("orderId");
  const [conversations, setConversations] = React.useState<ShopConversationWire[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ShopConversationWire | null>(null);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadList = React.useCallback(async () => {
    const page = await customerApi.conversations();
    setConversations(page.data);
    setSelectedId((current) => {
      if (current && page.data.some((row) => row.id === current)) return current;
      const target = page.data.find((row) => targetOrderId ? row.orderId === targetOrderId : targetShopId ? row.shopId === targetShopId && row.kind === "PRE_ORDER" : false);
      return target?.id ?? (targetShopId ? null : page.data[0]?.id ?? null);
    });
  }, [targetOrderId, targetShopId]);

  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    let active = true;
    setLoading(true);
    void loadList().catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Could not load messages")).finally(() => active && setLoading(false));
    const timer = window.setInterval(() => void loadList().catch(() => undefined), 8_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [auth.status, loadList]);

  const loadDetail = React.useCallback(async (id: string) => {
    const row = await customerApi.conversation(id);
    setDetail(row);
    await customerApi.markConversationRead(id).catch(() => undefined);
    setConversations((current) => current.map((item) => item.id === id ? { ...item, hasUnread: false } : item));
  }, []);

  React.useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not open conversation"));
    const timer = window.setInterval(() => void loadDetail(selectedId).catch(() => undefined), 5_000);
    return () => window.clearInterval(timer);
  }, [loadDetail, selectedId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    if (!selectedId && !targetShopId) { setError("Choose a shop before starting a conversation."); return; }
    setSending(true);
    setError(null);
    try {
      if (selectedId) {
        await customerApi.sendConversationMessage(selectedId, body);
        setDraft("");
        await Promise.all([loadDetail(selectedId), loadList()]);
      } else {
        const message = await customerApi.startConversation({
          shopId: targetShopId!,
          orderId: targetOrderId ?? undefined,
          message: body,
        });
        setDraft("");
        setSelectedId(message.conversationId);
        await loadList();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message was not sent");
    } finally {
      setSending(false);
    }
  }

  if (auth.status === "loading") return <div className="gp-container py-16 text-ink-500">Opening messages…</div>;
  if (auth.status === "anonymous") return (
    <div className="gp-container py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <LockKeyhole className="mx-auto h-10 w-10 text-crimson-500" />
        <h1 className="mt-4 text-2xl font-bold text-ink-900">Sign in to message shops</h1>
        <p className="mt-2 text-ink-600">Your conversations are private and stay with your account.</p>
        <Link href={`/login?next=${encodeURIComponent(`/messages${targetShopId ? `?shopId=${targetShopId}${targetOrderId ? `&orderId=${targetOrderId}` : ""}` : ""}`)}`} className="gp-btn gp-btn-primary mt-6 px-6 py-3">Sign in securely</Link>
      </div>
    </div>
  );

  const targetConversation = detail ?? conversations.find((row) => row.id === selectedId) ?? null;
  return (
    <div className="bg-paper py-6 md:py-10">
      <div className="gp-container">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><p className="text-sm font-bold text-crimson-600">Private shop conversations</p><h1 className="text-3xl font-extrabold text-ink-900">Messages</h1></div>
          <span className="hidden items-center gap-1.5 text-xs text-ink-500 sm:flex"><LockKeyhole className="h-3.5 w-3.5" /> Your phone number is not shared</span>
        </div>
        <div className="grid h-[calc(100dvh-180px)] min-h-[520px] overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className={cn("border-ink-100 md:border-r", selectedId || targetShopId ? "hidden md:block" : "block")}>
            <div className="border-b border-ink-100 p-4"><h2 className="font-bold text-ink-900">Your conversations</h2><p className="text-xs text-ink-500">Questions and order updates in one place</p></div>
            <div className="max-h-[680px] overflow-y-auto">
              {loading ? <p className="p-5 text-sm text-ink-500">Loading conversations…</p> : conversations.length === 0 ? <EmptyInbox /> : conversations.map((row) => (
                <button key={row.id} onClick={() => setSelectedId(row.id)} className={cn("flex w-full gap-3 border-b border-ink-100 p-4 text-left transition hover:bg-crimson-50/50", selectedId === row.id && "bg-crimson-50")}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-paper text-xl">{row.shop.emoji ?? "🏪"}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-ink-900">{row.shop.name}</strong>{row.hasUnread && <span className="h-2.5 w-2.5 rounded-full bg-crimson-500" />}</span><span className="mt-1 block truncate text-xs text-ink-500">{row.order ? `${row.order.code} · ` : ""}{row.lastMessage?.body ?? "Conversation started"}</span><span className="mt-1 block text-[11px] text-ink-400">{shortTime(row.lastMessageAt)}</span></span>
                </button>
              ))}
            </div>
          </aside>

          <section className={cn("flex min-w-0 flex-col", !selectedId && !targetShopId ? "hidden md:flex" : "flex")}>
            <div className="flex min-h-[74px] items-center gap-3 border-b border-ink-100 px-4 py-3 sm:px-5">
              <button onClick={() => { setSelectedId(null); setDetail(null); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink-100 md:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-crimson-50 text-crimson-600"><Store className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h2 className="truncate font-bold text-ink-900">{targetConversation?.shop.name ?? "New shop conversation"}</h2><p className="truncate text-xs text-ink-500">{targetConversation?.order ? `Order ${targetConversation.order.code}` : "Ask about an item, availability or delivery"}</p></div>
              {targetConversation?.order && <Link href={`/orders/${targetConversation.order.id}`} className="hidden items-center gap-1 rounded-full border border-ink-200 px-3 py-2 text-xs font-bold text-ink-700 hover:bg-ink-50 sm:flex"><ShoppingBag className="h-3.5 w-3.5" /> View order</Link>}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-[#FCFAFA] p-4 sm:p-6" aria-live="polite">
              {!targetConversation && targetShopId ? <div className="mx-auto mt-10 max-w-md rounded-2xl border border-crimson-100 bg-white p-5 text-center"><MessageCircle className="mx-auto h-8 w-8 text-crimson-500" /><h3 className="mt-3 font-bold text-ink-900">Start with your question</h3><p className="mt-1 text-sm text-ink-600">The shop cannot message you before you start this conversation. Once you send, their authorized team can reply.</p></div> : null}
              {detail?.messages?.map((message) => {
                const mine = message.sender === "CUSTOMER";
                return <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm", mine ? "rounded-br-md bg-crimson-500 text-white" : "rounded-bl-md border border-ink-100 bg-white text-ink-800")}><p className="whitespace-pre-wrap break-words">{message.body}</p><span className={cn("mt-1.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/75" : "text-ink-400")}>{shortTime(message.createdAt)}{mine && <CheckCheck className="h-3 w-3" />}</span></div></div>;
              })}
            </div>
            <form onSubmit={send} className="border-t border-ink-100 bg-white p-3 sm:p-4">
              {error && <p className="mb-2 rounded-xl bg-crimson-50 px-3 py-2 text-sm text-crimson-700">{error}</p>}
              <div className="flex items-end gap-2"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={2000} placeholder="Write a message…" className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-ink-200 px-4 py-3 text-sm outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-50" /><button disabled={sending || !draft.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-500 text-white shadow-crimson transition hover:bg-crimson-600 disabled:opacity-40" aria-label="Send message"><Send className="h-5 w-5" /></button></div>
              <p className="mt-2 text-center text-[11px] text-ink-400">Do not share OTPs, passwords or payment PINs in chat.</p>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptyInbox() {
  return <div className="p-8 text-center"><MessageCircle className="mx-auto h-9 w-9 text-ink-300" /><p className="mt-3 font-semibold text-ink-800">No conversations yet</p><p className="mt-1 text-sm text-ink-500">Open a shop and tap Contact shopkeeper.</p></div>;
}
