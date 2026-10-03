"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Clock3, LockKeyhole, Plus, ShoppingBag, UsersRound } from "lucide-react";
import { Button, Container } from "@/components/primitives";
import { useAuth } from "@/components/providers";
import { customerApi, type GroupOrderWire, type GroupPreviewWire } from "@/lib/api/customer";

function readError(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong";
}

export function GroupOrdersView() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [groups, setGroups] = React.useState<GroupOrderWire[]>([]);
  const [code, setCode] = React.useState("");
  const [preview, setPreview] = React.useState<GroupPreviewWire | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (auth.status !== "authenticated") {
      if (auth.status === "anonymous") setLoading(false);
      return;
    }
    void customerApi
      .groupOrders()
      .then((rows) => {
        setGroups(rows);
        setError(null);
      })
      .catch((cause) => setError(readError(cause)))
      .finally(() => setLoading(false));
  }, [auth.status]);

  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    const sharedCode = searchParams.get("code")?.trim().toUpperCase();
    if (!sharedCode || !/^GRP-[A-HJ-NP-Z2-9]{6}$/.test(sharedCode)) return;
    setCode(sharedCode);
    setBusy(true);
    void customerApi
      .groupOrderPreview(sharedCode)
      .then((result) => {
        setPreview(result);
        setError(null);
      })
      .catch((cause) => setError(readError(cause)))
      .finally(() => setBusy(false));
  }, [auth.status, searchParams]);

  const checkCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    try {
      setPreview(await customerApi.groupOrderPreview(normalized));
      setCode(normalized);
      setError(null);
    } catch (cause) {
      setPreview(null);
      setError(readError(cause));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      const group = await customerApi.joinGroupOrder(code);
      router.push(`/group-orders/${group.id}`);
    } catch (cause) {
      setError(readError(cause));
      setBusy(false);
    }
  };

  if (auth.status === "loading" || loading) {
    return <Container className="py-16 text-ink-500">Loading group orders…</Container>;
  }
  if (auth.status !== "authenticated") {
    return (
      <Container className="py-16 text-center">
        <UsersRound className="mx-auto h-11 w-11 text-crimson-500" />
        <h1 className="mt-4 text-3xl font-extrabold text-ink-900">Shop together in one order</h1>
        <p className="mx-auto mt-2 max-w-lg text-ink-600">
          Sign in to create or join a shared basket. Every participant chooses their own items; only
          the host checks out.
        </p>
        <Button href="/login?next=/group-orders" className="mt-6">
          Sign in
        </Button>
      </Container>
    );
  }

  return (
    <main className="min-h-[70vh] bg-gradient-to-b from-paper/60 to-white py-8 sm:py-12">
      <Container>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-3xl bg-ink-900 p-6 text-white shadow-card sm:p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold">
              <UsersRound className="h-4 w-4" /> Order together
            </span>
            <h1 className="mt-5 max-w-xl text-3xl font-extrabold sm:text-4xl">
              One delivery. Everyone adds what they need.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
              Start from a shop, share the private code, and let each person save their items. The
              host reviews the combined total and places one server-verified order.
            </p>
            <Button href="/shops" className="mt-6 bg-white text-ink-900 hover:bg-paper">
              <Plus className="h-4 w-4" /> Choose a shop to start
            </Button>
          </section>

          <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <h2 className="text-xl font-bold text-ink-900">Have an invite code?</h2>
            <p className="mt-1 text-sm text-ink-500">
              Enter the code exactly as shared by the host.
            </p>
            <form onSubmit={checkCode} className="mt-5 flex gap-2">
              <input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setPreview(null);
                }}
                maxLength={10}
                placeholder="GRP-ABC234"
                aria-label="Group order code"
                className="min-w-0 flex-1 rounded-xl border border-ink-200 px-4 py-3 font-mono uppercase tracking-wider outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-50"
              />
              <Button disabled={busy || code.trim().length < 10}>Check</Button>
            </form>
            {preview && (
              <div className="mt-4 rounded-2xl bg-paper p-4">
                <strong className="block text-ink-900">{preview.shop.name}</strong>
                <span className="mt-1 block text-sm text-ink-500">
                  {preview.participantCount} participant{preview.participantCount === 1 ? "" : "s"}{" "}
                  · {preview.status.toLowerCase()}
                </span>
                <Button
                  onClick={() => void join()}
                  disabled={busy || preview.status !== "OPEN"}
                  className="mt-4 w-full"
                >
                  Join this order <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-crimson-50 p-3 text-sm text-crimson-700"
              >
                {error}
              </p>
            )}
          </section>
        </div>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-ink-900">Your group orders</h2>
              <p className="mt-1 text-sm text-ink-500">Hosted and joined orders appear here.</p>
            </div>
            <span className="text-sm font-semibold text-ink-500">{groups.length}</span>
          </div>
          {groups.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-ink-200 bg-white p-10 text-center">
              <ShoppingBag className="mx-auto h-9 w-9 text-ink-300" />
              <h3 className="mt-3 font-bold text-ink-900">No group orders yet</h3>
              <p className="mt-1 text-sm text-ink-500">
                Choose a nearby shop or enter a code above.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={`/group-orders/${group.id}`}
                  className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-crimson-200 hover:shadow-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-crimson-50 text-crimson-600">
                      {group.status === "OPEN" ? (
                        <Clock3 className="h-5 w-5" />
                      ) : (
                        <LockKeyhole className="h-5 w-5" />
                      )}
                    </span>
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-600">
                      {group.status}
                    </span>
                  </div>
                  <h3 className="mt-4 font-bold text-ink-900">{group.shop.name}</h3>
                  <p className="mt-1 font-mono text-xs tracking-wider text-crimson-600">
                    {group.code}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
                    <span>
                      {group.participants.length}{" "}
                      {group.participants.length === 1 ? "person" : "people"}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </Container>
    </main>
  );
}
