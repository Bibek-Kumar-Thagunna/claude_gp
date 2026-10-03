"use client";

import * as React from "react";
import Link from "next/link";
import { Gift, X } from "lucide-react";
import { useAuth } from "@/components/providers";
import { customerApi } from "@/lib/api/customer";

const STORAGE_KEY = "gp-pending-referral";

export function ReferralCapture() {
  const auth = useAuth();
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref")?.trim().toUpperCase();
    if (!code || !/^GP-[A-Z2-9]{7}$/.test(code)) return;
    window.localStorage.setItem(STORAGE_KEY, code);
    url.searchParams.delete("ref");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setMessage(
      auth.status === "authenticated"
        ? "Applying your friend's referral…"
        : "Referral saved. Sign in or create your account to claim it.",
    );
  }, [auth.status]);

  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    const code = window.localStorage.getItem(STORAGE_KEY);
    if (!code) return;
    let active = true;
    void customerApi
      .redeemReferral(code)
      .then((result) => {
        window.localStorage.removeItem(STORAGE_KEY);
        if (active) setMessage(result.message);
      })
      .catch((cause: unknown) => {
        window.localStorage.removeItem(STORAGE_KEY);
        if (active)
          setMessage(
            cause instanceof Error ? cause.message : "This referral could not be claimed.",
          );
      });
    return () => {
      active = false;
    };
  }, [auth.status]);

  if (!message) return null;
  return (
    <aside className="fixed inset-x-4 bottom-24 z-[85] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-float sm:bottom-6">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
        <Gift className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-sm text-ink-900">GoPasal referral</strong>
        <p className="mt-0.5 text-sm leading-5 text-ink-600">{message}</p>
        {auth.status !== "authenticated" && (
          <Link href="/login" className="mt-2 inline-block text-sm font-bold text-crimson-600">
            Continue to sign in
          </Link>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss referral message"
        onClick={() => setMessage(null)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-ink-100"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
