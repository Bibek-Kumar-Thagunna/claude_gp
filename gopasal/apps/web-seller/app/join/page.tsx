"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Store } from "lucide-react";
import { Logo } from "@gopasal/ui";
import { ApiError } from "@gopasal/api-client";
import { Button, Card, Badge } from "@/components/primitives";
import { InlineError, InlineNotice } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { acceptInvite, pendingInvites, type PendingInvite } from "@/lib/api/invites";

const CODE_LENGTH = 6;

export default function ShopInviteCodePage() {
  const router = useRouter();
  const { status, user, reload, signOut } = useAuth();
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState<PendingInvite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [acceptedRole, setAcceptedRole] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    pendingInvites()
      .then((items) => {
        if (active) setPending(items.filter((item) => item.scope === "SHOP"));
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Pending invitations could not be loaded.");
      });
    return () => { active = false; };
  }, [status]);

  const accept = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await acceptInvite({ code, scope: "SHOP" });
      await reload();
      setAcceptedRole(result.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The invitation could not be accepted.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-7 flex justify-center"><Logo variant="full" height={32} /></div>
        <Card className="p-6 sm:p-8">
          {acceptedRole ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#0B7E58]" />
              <h1 className="mt-4 text-2xl font-bold text-ink-900">You’re on the team</h1>
              <p className="mt-2 text-sm text-ink-500">Your {acceptedRole} access is active and your permissions have been refreshed.</p>
              <Button className="mt-6" onClick={() => router.replace("/dashboard")}>Open seller console</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600"><KeyRound className="h-5 w-5" /></span>
                <div><Badge tone="crimson">Secure invitation</Badge><h1 className="mt-1 text-2xl font-bold text-ink-900">Enter your shop invite code</h1></div>
              </div>
              <p className="mt-5 text-sm leading-6 text-ink-600">Sign in with the exact mobile number the shop owner invited, then enter the six-digit code they shared with you.</p>
              {error && <InlineError className="mt-4" message={error} />}
              {status === "anonymous" ? (
                <Button className="mt-6 w-full" size="lg" href="/login?returnTo=%2Fjoin">Sign in to continue</Button>
              ) : status === "authenticated" ? (
                <div className="mt-6">
                  <InlineNotice message={`Signed in as +977 ${user?.phone ?? ""}. Invitation codes only work for this verified number.`} />
                  {pending.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {pending.map((invite) => (
                        <div key={invite.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
                          <Store className="h-4 w-4 shrink-0 text-crimson-600" />
                          <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{invite.shop?.name ?? "Shop invitation"}</p><p className="text-xs text-ink-500">{invite.role}</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                  <form className="mt-5" onSubmit={(event) => { event.preventDefault(); if (code.length === CODE_LENGTH && !loading) void accept(); }}>
                    <label className="block text-sm font-medium text-ink-700" htmlFor="invite-code">Invitation code</label>
                    <input id="invite-code" autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={CODE_LENGTH} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))} placeholder="000000" className="mt-2 h-14 w-full rounded-xl border border-ink-200 bg-white px-4 text-center font-mono text-2xl font-bold tracking-[0.45em] outline-none focus:border-crimson-400" />
                    <Button type="submit" className="mt-4 w-full" size="lg" disabled={code.length !== CODE_LENGTH || loading}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Accepting…</> : <><ShieldCheck className="h-4 w-4" /> Accept shop invitation</>}</Button>
                  </form>
                  <button className="mt-4 w-full text-sm font-medium text-ink-500 hover:text-ink-800" onClick={() => void signOut()}>Use a different number</button>
                </div>
              ) : <p className="mt-6 text-center text-sm text-ink-500">Checking your session…</p>}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
