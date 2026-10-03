"use client";

import * as React from "react";
import { Headphones, MessageSquare, Paperclip } from "lucide-react";
import { Can, PermissionGate } from "@/components/PermissionGate";
import { EmptyState, PageHeader } from "@/components/primitives";
import { adminApi, type AdminTicket } from "@/lib/api/admin";

export default function SupportPage() {
  return (
    <PermissionGate perm="support.view">
      <SupportInbox />
    </PermissionGate>
  );
}

function AssistantHandoffBadge({ detailed = false }: { detailed?: boolean }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      {detailed ? "Assistant handoff · transcript attached" : "Assistant handoff"}
    </span>
  );
}

function SupportInbox() {
  const [tickets, setTickets] = React.useState<AdminTicket[]>([]);
  const [selected, setSelected] = React.useState<AdminTicket | null>(null);
  const [reply, setReply] = React.useState("");
  const [replyFile, setReplyFile] = React.useState<File | null>(null);
  const replyFileInput = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadList = React.useCallback(() => adminApi.supportTickets().then(setTickets), []);
  React.useEffect(() => {
    void loadList().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Could not load support tickets"),
    );
  }, [loadList]);

  const refresh = async (id: string) => {
    await loadList();
    setSelected(await adminApi.supportTicket(id));
  };

  const open = async (ticket: AdminTicket) => {
    setError(null);
    try {
      setSelected(await adminApi.supportTicket(ticket.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open ticket");
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.replySupportTicket(selected.id, reply.trim(), replyFile ?? undefined);
      setReply("");
      setReplyFile(null);
      if (replyFileInput.current) replyFileInput.current.value = "";
      await refresh(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send reply");
    } finally {
      setBusy(false);
    }
  };

  const download = async (ticketId: string, fileId: string, fileName: string) => {
    setError(null);
    try {
      const blob = await adminApi.supportTicketFile(ticketId, fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download attachment");
    }
  };

  const close = async () => {
    if (!selected || !window.confirm(`Close ${selected.code}? This is audit logged.`)) return;
    setBusy(true);
    try {
      await adminApi.setSupportTicketStatus(selected.id, "CLOSED");
      await refresh(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not close ticket");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={<Headphones className="h-5 w-5" />}
        title="Support inbox"
        subtitle="Persisted customer tickets and audit-logged staff responses"
      />
      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {tickets.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No support tickets"
          description="Customer tickets will appear here as soon as they are submitted."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                aria-pressed={selected?.id === ticket.id}
                onClick={() => void open(ticket)}
                className={`w-full rounded-xl border bg-white p-4 text-left transition hover:border-crimson-300 ${
                  selected?.id === ticket.id ? "border-crimson-400" : "border-ink-200"
                }`}
              >
                <div className="flex justify-between gap-3">
                  <strong className="text-sm text-ink-900">{ticket.subject}</strong>
                  <span className="text-xs font-bold text-crimson-700">{ticket.status}</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {ticket.code} · {ticket.user.name ?? ticket.user.phone}
                </p>
                {ticket.category === "assistant_handoff" && (
                  <span className="mt-2 block">
                    <AssistantHandoffBadge detailed />
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="gp-panel p-5">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-ink-900">{selected.subject}</h2>
                      {selected.category === "assistant_handoff" && <AssistantHandoffBadge />}
                    </div>
                    <p className="text-xs text-ink-500">
                      {selected.code} · {selected.user.phone} · {selected.priority}
                    </p>
                    {selected.category === "assistant_handoff" && (
                      <p className="mt-2 max-w-xl text-xs leading-5 text-ink-500">
                        The customer’s assistant transcript is attached below, so support can continue
                        without asking them to repeat it.
                      </p>
                    )}
                  </div>
                  <Can perm="support.respond">
                    <button
                      type="button"
                      disabled={busy || selected.status === "CLOSED"}
                      onClick={() => void close()}
                      className="rounded-full border border-ink-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      Close ticket
                    </button>
                  </Can>
                </div>

                <div className="mt-5 space-y-3">
                  {selected.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-xl p-3 text-sm ${
                        message.isStaff ? "ml-4 bg-crimson-50 sm:ml-8" : "mr-4 bg-ink-50 sm:mr-8"
                      }`}
                    >
                      <p className="font-semibold text-ink-700">
                        {message.isStaff ? "GoPasal staff" : "Customer"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-ink-700">{message.body}</p>
                      {message.files?.map((file) => <button key={file.id} type="button" onClick={() => void download(selected.id, file.id, file.fileName)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-crimson-700"><Paperclip className="h-3.5 w-3.5" /> Download {file.fileName}</button>)}
                    </div>
                  ))}
                </div>

                {selected.status !== "CLOSED" && (
                  <Can perm="support.respond">
                    <form onSubmit={send} className="mt-5">
                      <textarea
                        required
                        maxLength={4000}
                        rows={4}
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Write a response"
                        className="w-full rounded-xl border border-ink-200 p-3 text-sm outline-none focus:border-crimson-400"
                      />
                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-600"><Paperclip className="h-4 w-4" /> {replyFile ? replyFile.name : "Attach a photo or PDF (optional)"}<input ref={replyFileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReplyFile(event.target.files?.[0] ?? null)} className="sr-only" /></label>
                      <button
                        disabled={busy || !reply.trim()}
                        className="mt-3 rounded-full bg-crimson-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "Sending…" : "Send response"}
                      </button>
                    </form>
                  </Can>
                )}
              </>
            ) : (
              <p className="py-16 text-center text-sm text-ink-500">Select a ticket to read the thread.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
