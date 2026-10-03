"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, Store } from "lucide-react";
import { Logo } from "@gopasal/ui";
import { ApiError } from "@gopasal/api-client";
import { Button, Card, Badge } from "@/components/primitives";
import { InlineError, InlineNotice } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { acceptInvite, previewInvite, type InvitePreview } from "@/lib/api/invites";

export default function ShopInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { status: authStatus, user, reload, signOut } = useAuth();
  const [invite, setInvite] = React.useState<InvitePreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [accepting, setAccepting] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    previewInvite(token, controller.signal)
      .then((result) => {
        setInvite(result);
        setError(result.scope === "SHOP" ? null : "This invitation belongs in the admin console.");
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof ApiError ? err.message : "This invitation could not be opened.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await acceptInvite({ token });
      await reload();
      setAccepted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The invitation could not be accepted.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-7 flex justify-center"><Logo variant="full" height={32} /></div>
        <Card className="p-6 sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-500">
              <Loader2 className="h-5 w-5 animate-spin text-crimson-500" /> Opening invitation…
            </div>
          ) : accepted ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#0B7E58]" />
              <h1 className="mt-4 text-2xl font-bold text-ink-900">You’re on the team</h1>
              <p className="mt-2 text-sm text-ink-500">Your {invite?.role.name} access is active. GoPasal has refreshed your permissions.</p>
              <Button className="mt-6" onClick={() => router.replace("/dashboard")}>Open seller console</Button>
            </div>
          ) : invite ? (
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600"><Store className="h-5 w-5" /></span>
                <div><Badge tone="crimson">Shop invitation</Badge><h1 className="mt-1 text-2xl font-bold text-ink-900">Join {invite.shop?.name ?? "this shop"}</h1></div>
              </div>
              <p className="mt-5 text-sm leading-6 text-ink-600">
                {invite.invitedBy ? `${invite.invitedBy} invited you` : "You were invited"} as <strong>{invite.role.name}</strong> using the number {invite.phoneMasked}.
              </p>
              {invite.role.description && <p className="mt-2 text-sm text-ink-500">{invite.role.description}</p>}
              {invite.note && <InlineNotice className="mt-4" message={invite.note} />}
              {error && <InlineError className="mt-4" message={error} />}
              {invite.status !== "PENDING" && <InlineError className="mt-4" message={`This invitation is ${invite.status.toLowerCase()} and cannot be used.`} />}
              <div className="mt-6">
                {authStatus === "anonymous" ? (
                  <Button className="w-full" size="lg" href={`/login?returnTo=${encodeURIComponent(`/join/${token}`)}`}>Sign in with the invited number</Button>
                ) : authStatus === "authenticated" ? (
                  <>
                    <InlineNotice message={`Signed in as +977 ${user?.phone ?? ""}. The API will only accept the exact invited number.`} />
                    <Button className="mt-4 w-full" size="lg" disabled={accepting || invite.status !== "PENDING" || invite.scope !== "SHOP"} onClick={() => void accept()}>
                      {accepting ? <><Loader2 className="h-4 w-4 animate-spin" /> Accepting…</> : <><ShieldCheck className="h-4 w-4" /> Accept invitation</>}
                    </Button>
                    <button className="mt-4 w-full text-sm font-medium text-ink-500 hover:text-ink-800" onClick={() => void signOut()}>Use a different number</button>
                  </>
                ) : <p className="text-center text-sm text-ink-500">Checking your session…</p>}
              </div>
            </div>
          ) : <InlineError message={error ?? "This invitation is not available."} />}
        </Card>
      </div>
    </main>
  );
}
