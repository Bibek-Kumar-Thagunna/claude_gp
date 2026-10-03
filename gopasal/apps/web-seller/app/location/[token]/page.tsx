"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Crosshair, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/primitives";
import { submitCapturedPosition } from "@/lib/api/location-capture";

type LinkInfo = { status: "WAITING" | "CAPTURED"; purpose: string; expiresAt: string; maximumAccuracyM: number };

export default function LocationCapturePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [info, setInfo] = React.useState<LinkInfo | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetch(`/api/location-captures/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as LinkInfo | { message?: string } | null;
        if (!response.ok) throw new Error(body && "message" in body ? body.message : "This private link is unavailable.");
        setInfo(body as LinkInfo);
        setDone((body as LinkInfo).status === "CAPTURED");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "This private link is unavailable."))
      .finally(() => setBusy(false));
  }, [token]);

  async function capture() {
    if (!window.isSecureContext) {
      setError("Precise location requires HTTPS. Ask the sender for the secure GoPasal link.");
      return;
    }
    if (!navigator.geolocation) {
      setError("This browser cannot share GPS location. Open the link in a current phone browser.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void submitCapturedPosition(token, position)
          .then(() => setDone(true))
          .catch((cause) => setError(cause instanceof Error ? cause.message : "The location could not be saved."))
          .finally(() => setBusy(false));
      },
      (failure) => {
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? "Location permission was blocked. Allow precise location for this site and try again."
            : "A precise GPS position was not available. Move near a window or the shop entrance and try again.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  }

  return (
    <main className="min-h-screen bg-ink-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-ink-100 bg-white p-6 shadow-xl shadow-ink-900/5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-700"><MapPin className="h-5 w-5" /></span>
          <div><p className="text-xs font-bold uppercase tracking-wider text-crimson-600">GoPasal verification</p><h1 className="text-xl font-bold text-ink-900">Confirm the shop location</h1></div>
        </div>

        {busy && !info && <p className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking this private link…</p>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {done ? (
          <div className="mt-7 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="mt-3 text-lg font-bold text-ink-900">Location saved</h2><p className="mt-1 text-sm text-ink-500">You can close this page. The seller’s screen will update automatically.</p></div>
        ) : info ? (
          <div className="mt-6">
            <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"><strong>Only continue while you are physically inside the shop.</strong> Do not share your home, office or current travel location.</div>
            <ol className="mt-5 space-y-3 text-sm text-ink-600"><li className="flex gap-3"><span className="font-bold text-crimson-600">1</span>Stand inside the shop, preferably near its entrance.</li><li className="flex gap-3"><span className="font-bold text-crimson-600">2</span>Tap the button and allow precise location.</li><li className="flex gap-3"><span className="font-bold text-crimson-600">3</span>Keep this page open until it confirms the location was saved.</li></ol>
            <Button className="mt-6 w-full" disabled={busy} onClick={() => void capture()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}{busy ? "Finding a precise position…" : "I am inside the shop — share location"}</Button>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />This link is one-use and expires after 10 minutes. It does not sign you into the seller’s account or expose their documents.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
