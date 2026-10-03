"use client";

/* eslint-disable @next/next/no-img-element -- authenticated blob URLs cannot use the Next image optimizer */

import * as React from "react";
import { Camera, Loader2, ShieldCheck } from "lucide-react";
import { deliveryProof } from "@/lib/api/orders";

export function DeliveryProofPhoto({ shopId, orderId }: { shopId: string; orderId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const blob = await deliveryProof(shopId, orderId);
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open delivery proof");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-ink-100 pt-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p className="text-xs leading-5 text-ink-500">
          Private handover evidence. Access is permission-checked and audit logged.
        </p>
      </div>
      {url ? (
        <img src={url} alt="Private delivery handover evidence" className="mt-3 max-h-80 w-full rounded-xl border border-ink-100 object-contain" />
      ) : (
        <button type="button" disabled={busy} onClick={() => void open()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {busy ? "Opening securely…" : "View proof photo"}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
