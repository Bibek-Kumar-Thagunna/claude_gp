"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Headphones, LockKeyhole, Paperclip, Send, Sparkles, TicketCheck, UserRound } from "lucide-react";
import { customerApi, type SupportAssistantSessionWire, type SupportTicketWire } from "@/lib/api/customer";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

const QUICK_QUESTIONS = [
  "How do I track my order?",
  "How does the delivery range work?",
  "What should I do if my payment is pending?",
  "How do refunds work?",
];

export function SupportTickets() {
  const auth = useAuth();
  const [tickets, setTickets] = React.useState<SupportTicketWire[]>([]);
  const [session, setSession] = React.useState<SupportAssistantSessionWire | null>(null);
  const [draft, setDraft] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [showTicketForm, setShowTicketForm] = React.useState(false);
  const [selected, setSelected] = React.useState<SupportTicketWire | null>(null);
  const [reply, setReply] = React.useState("");
  const [replyFile, setReplyFile] = React.useState<File | null>(null);
  const replyFileInput = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const threadRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const [ticketRows, current] = await Promise.all([
      customerApi.supportTickets(),
      customerApi.currentSupportAssistantSession(),
    ]);
    setTickets(ticketRows);
    setSession(current);
  }, []);

  React.useEffect(() => {
    if (auth.status === "authenticated") void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load support"));
  }, [auth.status, load]);

  React.useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length]);

  if (auth.status === "loading") return <p className="text-sm text-ink-500">Loading your support account…</p>;
  if (auth.status !== "authenticated") return <div className="rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-card"><LockKeyhole className="mx-auto h-10 w-10 text-crimson-500" /><h2 className="mt-4 text-xl font-bold text-ink-900">Sign in for private support</h2><p className="mt-2 text-ink-600">Ask the GoPasal assistant or open a tracked ticket with a support person.</p><Button href="/login" className="mt-5">Sign in securely</Button></div>;

  async function ask(event: React.FormEvent, preset?: string) {
    event.preventDefault();
    const body = (preset ?? draft).trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await customerApi.askSupportAssistant({ sessionId: session?.status === "ACTIVE" ? session.id : undefined, message: body, clientMessageId: crypto.randomUUID() });
      setSession(next);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assistant could not answer");
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = await customerApi.escalateSupportAssistant(session.id, {
        subject: session.messages.filter((item) => item.role === "CUSTOMER").at(-1)?.body.slice(0, 120),
        reason: "Customer requested a human support review.",
      });
      setSession({ ...session, status: "ESCALATED", ticketId: ticket.id, ticket: { id: ticket.id, code: ticket.code, status: ticket.status } });
      await customerApi.supportTickets().then(setTickets);
      setSelected(await customerApi.supportTicket(ticket.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not hand this conversation to support");
    } finally {
      setBusy(false);
    }
  }

  async function submitTicket(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await customerApi.createSupportTicket({ subject, message, category: "general" });
      setSubject(""); setMessage(""); setShowTicketForm(false);
      await customerApi.supportTickets().then(setTickets);
      setSelected(await customerApi.supportTicket(created.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create ticket");
    } finally {
      setBusy(false);
    }
  }

  async function openTicket(id: string) {
    setError(null);
    try { setSelected(await customerApi.supportTicket(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open ticket"); }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      setSelected(await customerApi.replySupportTicket(selected.id, reply.trim(), replyFile ?? undefined));
      setReply(""); setReplyFile(null);
      if (replyFileInput.current) replyFileInput.current.value = "";
      await customerApi.supportTickets().then(setTickets);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send reply"); }
    finally { setBusy(false); }
  }

  async function downloadTicketFile(ticketId: string, fileId: string, fileName: string) {
    setError(null);
    try {
      const blob = await customerApi.supportTicketFile(ticketId, fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download attachment"); }
  }

  const lastAnswer = session?.messages.at(-1);
  const needsHuman = lastAnswer?.role === "ASSISTANT" && lastAnswer.shouldEscalate;

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-gradient-to-r from-crimson-50 to-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-crimson-500 text-white shadow-crimson"><Sparkles className="h-5 w-5" /></span><div><div className="flex items-center gap-2"><h2 className="font-bold text-ink-900">GoPasal Assistant</h2><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Source-grounded</span></div><p className="text-xs text-ink-500">Quick guidance with a human whenever you need one</p></div></div>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-500"><LockKeyhole className="h-3.5 w-3.5" /> Never share OTPs or wallet PINs</span>
      </header>

      <div ref={threadRef} className="h-[min(52vh,520px)] min-h-[360px] space-y-4 overflow-y-auto bg-[#FCFAFA] p-4 sm:p-6" aria-live="polite">
        {!session?.messages.length ? <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center"><span className="grid h-16 w-16 place-items-center rounded-3xl bg-crimson-50 text-crimson-600"><Bot className="h-8 w-8" /></span><h3 className="mt-4 text-xl font-bold text-ink-900">How can we help?</h3><p className="mt-2 max-w-lg text-sm leading-6 text-ink-600">Answers come only from approved GoPasal guidance. Account decisions, refunds and disputes always go to a person.</p><div className="mt-5 flex flex-wrap justify-center gap-2">{QUICK_QUESTIONS.map((question) => <button key={question} disabled={busy} onClick={(event) => void ask(event, question)} className="rounded-full border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 transition hover:border-crimson-300 hover:text-crimson-700 disabled:opacity-50">{question}</button>)}</div></div> : session.messages.map((item) => {
          const mine = item.role === "CUSTOMER";
          return <div key={item.id} className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}><span className={cn("mt-1 hidden h-8 w-8 shrink-0 place-items-center rounded-full sm:grid", mine ? "order-2 bg-ink-100 text-ink-600" : "bg-crimson-50 text-crimson-600")}>{mine ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span><div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[72%]", mine ? "rounded-br-md bg-crimson-500 text-white" : "rounded-bl-md border border-ink-100 bg-white text-ink-800")}><p className="whitespace-pre-wrap leading-6">{item.body}</p>{!mine && item.sources.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{item.sources.map((source) => <span key={source.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {source.title}</span>)}</div> : null}</div></div>;
        })}
        {session?.ticket ? <div className="mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center"><TicketCheck className="mx-auto h-6 w-6 text-emerald-700" /><p className="mt-2 font-bold text-emerald-900">Sent to human support</p><p className="mt-1 text-sm text-emerald-800">Ticket {session.ticket.code} contains this conversation. A support person can continue from there.</p><button type="button" onClick={() => void openTicket(session.ticket!.id)} className="mt-3 rounded-full bg-emerald-800 px-4 py-2 text-xs font-bold text-white">Open ticket</button></div> : null}
      </div>

      <div className="border-t border-ink-100 bg-white p-3 sm:p-4">
        {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {needsHuman && !session?.ticket ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"><div><p className="text-sm font-bold text-amber-900">This needs a support person</p><p className="text-xs text-amber-800">Your conversation will be attached so you do not have to repeat yourself.</p></div><button disabled={busy} onClick={() => void escalate()} className="rounded-full bg-ink-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Talk to a person</button></div> : null}
        {session?.status === "ESCALATED" ? <div className="flex justify-center"><button disabled={busy} onClick={() => setSession(null)} className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700">Start a new assistant conversation</button></div> : <form onSubmit={(event) => void ask(event)} className="flex items-end gap-2"><textarea rows={1} maxLength={1200} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about orders, delivery, payment, refunds or rewards…" className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-ink-200 px-4 py-3 text-sm outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-50" /><button disabled={busy || !draft.trim()} aria-label="Send question" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-500 text-white shadow-crimson disabled:opacity-40"><Send className="h-5 w-5" /></button></form>}
        <p className="mt-2 text-center text-[11px] text-ink-400">The assistant cannot approve refunds, change orders, move money or access your credentials.</p>
      </div>
    </section>

    <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:p-6"><Headphones className="h-7 w-7 text-crimson-500" /><h2 className="mt-3 text-xl font-bold text-ink-900">Human support</h2><p className="mt-2 text-sm leading-6 text-ink-600">For account-specific help, payment investigation, disputes or anything the assistant cannot answer.</p><button onClick={() => setShowTicketForm((value) => !value)} className="mt-4 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-bold text-white">{showTicketForm ? "Hide form" : "Open a ticket"}</button>{showTicketForm ? <form onSubmit={submitTicket} className="mt-5 space-y-4"><label className="block text-sm font-semibold text-ink-700">Subject<input required minLength={3} maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-ink-200 px-4 outline-none focus:border-crimson-400" /></label><label className="block text-sm font-semibold text-ink-700">What happened?<textarea required minLength={2} maxLength={4000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full rounded-xl border border-ink-200 p-4 outline-none focus:border-crimson-400" /></label><button disabled={busy} className="rounded-full bg-crimson-500 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit ticket"}</button></form> : null}</div>
      <div><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-ink-900">Your tickets</h2><Link href="/orders" className="text-sm font-semibold text-crimson-600">Order-specific help →</Link></div>{tickets.length === 0 ? <p className="mt-4 rounded-3xl border border-ink-100 bg-white p-6 text-ink-600">No support tickets yet.</p> : <div className="mt-4 space-y-3">{tickets.map((ticket) => <button type="button" aria-pressed={selected?.id === ticket.id} onClick={() => void openTicket(ticket.id)} key={ticket.id} className={cn("w-full rounded-2xl border bg-white p-5 text-left shadow-soft transition hover:border-crimson-300", selected?.id === ticket.id ? "border-crimson-400" : "border-ink-100")}><div className="flex justify-between gap-3"><strong className="text-ink-900">{ticket.subject}</strong><span className="rounded-full bg-crimson-50 px-2.5 py-1 text-[10px] font-bold text-crimson-700">{ticket.status}</span></div><p className="mt-1 text-xs text-ink-500">{ticket.code} · updated {new Date(ticket.updatedAt).toLocaleDateString("en-NP")}</p>{ticket.messages[0] ? <p className="mt-3 line-clamp-2 text-sm text-ink-600">{ticket.messages[0].body}</p> : null}</button>)}</div>}
        {selected ? <div className="mt-5 rounded-3xl border border-ink-100 bg-white p-5 shadow-soft sm:p-6"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-ink-900">{selected.subject}</h3><p className="text-xs text-ink-500">{selected.code} · {selected.status}</p></div><button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-ink-500">Close view</button></div><div className="mt-5 max-h-96 space-y-3 overflow-y-auto" aria-live="polite">{selected.messages.map((item) => <div key={item.id} className={cn("rounded-2xl p-3 text-sm", item.isStaff ? "mr-4 bg-crimson-50" : "ml-4 bg-ink-50")}><p className="text-xs font-bold text-ink-600">{item.isStaff ? "GoPasal support" : "You"}</p><p className="mt-1 whitespace-pre-wrap text-ink-800">{item.body}</p>{item.files?.map((file) => <button key={file.id} type="button" onClick={() => void downloadTicketFile(selected.id, file.id, file.fileName)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-crimson-700"><Paperclip className="h-3.5 w-3.5" /> Download {file.fileName}</button>)}</div>)}</div>{selected.status !== "CLOSED" ? <form onSubmit={sendReply} className="mt-5 space-y-3"><textarea required maxLength={4000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to support…" className="w-full rounded-xl border border-ink-200 p-3 text-sm outline-none focus:border-crimson-400" /><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-600"><Paperclip className="h-4 w-4" /> {replyFile ? replyFile.name : "Attach a photo or PDF (optional)"}<input ref={replyFileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReplyFile(event.target.files?.[0] ?? null)} className="sr-only" /></label><button disabled={busy || !reply.trim()} className="rounded-full bg-crimson-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Send reply"}</button></form> : <p className="mt-4 text-xs text-ink-500">This ticket is closed. Open a new one if you need more help.</p>}</div> : null}</div>
    </section>
  </div>;
}
