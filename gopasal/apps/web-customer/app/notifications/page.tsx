"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Container, Button } from "@/components/primitives";
import { useAuth } from "@/components/providers";
import { customerApi, type NotificationWire } from "@/lib/api/customer";

export default function NotificationsPage() {
  const auth = useAuth();
  const [items, setItems] = React.useState<NotificationWire[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await customerApi.notifications();
      setItems(result.items); setUnread(result.unread); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load notifications"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { if (auth.status === "authenticated") void load(); else setLoading(false); }, [auth.status, load]);

  if (auth.status === "loading") return <Container className="py-16">Loading your account…</Container>;
  if (auth.status !== "authenticated") return <Container className="py-16"><h1 className="text-3xl font-bold">Notifications</h1><p className="mt-3 text-ink-600">Log in to see order and account updates.</p><Button href="/login" className="mt-6">Log in</Button></Container>;

  return <Container className="py-12 md:py-16">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="flex items-center gap-3 text-3xl font-bold text-ink-900"><Bell className="h-7 w-7 text-crimson-500" /> Notifications</h1><p className="mt-2 text-ink-600">{unread ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You’re all caught up."}</p></div>
      {unread > 0 && <button onClick={() => void customerApi.markAllNotificationsRead().then(load)} className="inline-flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold hover:bg-ink-50"><CheckCheck className="h-4 w-4" /> Mark all read</button>}
    </div>
    {loading ? <p className="mt-10 text-ink-500">Loading notifications…</p> : error ? <div className="mt-8 rounded-xl bg-crimson-50 p-4 text-crimson-700">{error} <button onClick={() => void load()} className="ml-2 font-bold underline">Retry</button></div> : items.length === 0 ? <div className="mt-10 rounded-2xl border border-ink-200 bg-white p-8 text-center text-ink-600">Order and account updates will appear here.</div> : <div className="mt-8 space-y-3">{items.map((note) => {
      const orderId = typeof note.data?.orderId === "string" ? note.data.orderId : null;
      const body = <div className={`rounded-2xl border p-5 transition ${note.readAt ? "border-ink-100 bg-white" : "border-crimson-200 bg-crimson-50"}`}><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-ink-900">{note.title}</h2><p className="mt-1 text-sm leading-relaxed text-ink-600">{note.body}</p><p className="mt-2 text-xs text-ink-400">{new Date(note.createdAt).toLocaleString()}</p></div>{!note.readAt && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-crimson-500" />}</div></div>;
      return orderId ? <Link key={note.id} href={`/orders/${encodeURIComponent(orderId)}`} onClick={() => { if (!note.readAt) void customerApi.markNotificationRead(note.id); }}>{body}</Link> : <button key={note.id} className="block w-full text-left" onClick={() => { if (!note.readAt) void customerApi.markNotificationRead(note.id).then(load); }}>{body}</button>;
    })}</div>}
  </Container>;
}
