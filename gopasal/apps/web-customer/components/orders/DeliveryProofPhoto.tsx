"use client";

/* eslint-disable @next/next/no-img-element -- authenticated blob URLs cannot use the Next image optimizer */

import * as React from "react";
import { Camera, Loader2, ShieldCheck } from "lucide-react";
import { customerApi } from "@/lib/api/customer";

export function DeliveryProofPhoto({ orderId }: { orderId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const blob = await customerApi.deliveryProof(orderId);
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the handover photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-base font-bold text-ink-900">Handover evidence</h2>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            This private photo is visible only to you, the shop, the assigned rider, and authorized
            GoPasal dispute staff.
          </p>
        </div>
      </div>
      {url ? (
        <img src={url} alt="Private delivery handover evidence" className="mt-4 max-h-80 w-full rounded-2xl border border-ink-100 object-contain" />
      ) : (
        <button type="button" disabled={busy} onClick={() => void open()} className="gp-btn mt-4 w-full border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 hover:bg-ink-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {busy ? "Opening securely…" : "View handover photo"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-crimson-700">{error}</p>}
    </section>
  );
}
