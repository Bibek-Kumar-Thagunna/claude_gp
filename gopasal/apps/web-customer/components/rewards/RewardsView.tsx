"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Coins, Copy, Gift, Share2, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/components/providers";
import {
  customerApi,
  type LoyaltySummaryWire,
  type ReferralHistoryWire,
  type ReferralSummaryWire,
} from "@/lib/api/customer";

export function RewardsView() {
  const auth = useAuth();
  const [loyalty, setLoyalty] = React.useState<LoyaltySummaryWire | null>(null);
  const [referral, setReferral] = React.useState<ReferralSummaryWire | null>(null);
  const [history, setHistory] = React.useState<ReferralHistoryWire[]>([]);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    void Promise.all([
      customerApi.loyalty(),
      customerApi.referrals(),
      customerApi.referralHistory(),
    ])
      .then(([loyaltyResult, referralResult, historyResult]) => {
        setLoyalty(loyaltyResult);
        setReferral(referralResult);
        setHistory(historyResult);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load rewards"),
      );
  }, [auth.status]);

  if (auth.status === "loading")
    return <div className="gp-container py-16 text-ink-500">Loading your rewards…</div>;
  if (auth.status === "anonymous")
    return (
      <div className="gp-container py-16 text-center">
        <Gift className="mx-auto h-10 w-10 text-crimson-500" />
        <h1 className="mt-4 text-3xl font-bold text-ink-900">Your GoPasal rewards</h1>
        <p className="mt-2 text-ink-600">Sign in to earn, invite friends and use GoCoins.</p>
        <Link
          href="/login?next=/rewards"
          className="gp-btn gp-btn-primary mt-6 inline-flex px-5 py-3"
        >
          Sign in
        </Link>
      </div>
    );

  const shareUrl = referral
    ? `${typeof window === "undefined" ? "" : window.location.origin}/?ref=${referral.code}`
    : "";
  async function share() {
    if (!referral) return;
    const text = `Shop from neighbourhood stores on GoPasal. Use my invite ${referral.code}; your GoCoins unlock after your first delivered order.`;
    if (navigator.share) {
      await navigator.share({ title: "Join me on GoPasal", text, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  }

  return (
    <main className="min-h-[70vh] bg-gradient-to-b from-paper/60 to-white py-10">
      <div className="gp-container">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
            <Sparkles className="h-4 w-4" /> GoPasal Rewards
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-ink-900 sm:text-4xl">
            Earn locally. Save on your next order.
          </h1>
          <p className="mt-2 text-ink-600">
            GoCoins are promotional credits, cannot be withdrawn as cash, and are applied securely
            at checkout.
          </p>
        </div>

        {error && <p className="mt-6 rounded-xl bg-crimson-50 p-4 text-crimson-700">{error}</p>}
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <section className="rounded-3xl bg-ink-900 p-6 text-white shadow-card lg:col-span-1">
            <Coins className="h-8 w-8 text-amber-300" />
            <p className="mt-5 text-sm text-white/65">Available balance</p>
            <strong className="mt-1 block text-4xl">{loyalty?.points ?? 0} GoCoins</strong>
            <p className="mt-2 text-sm text-white/75">
              10 GoCoins = रु 1 discount. Up to 20% of an order can be paid with GoCoins.
            </p>
            <Link
              href="/shops"
              className="mt-6 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-ink-900"
            >
              Use at checkout
            </Link>
          </section>

          <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card lg:col-span-2">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-crimson-50 text-crimson-600">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-ink-900">Invite friends</h2>
                <p className="text-sm text-ink-600">
                  You earn रु {referral?.rewardValueRupees ?? 20}; your friend earns रु 10 in
                  GoCoins after their first delivered order.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-paper p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <small className="block font-bold uppercase tracking-wide text-ink-400">
                  Your invite code
                </small>
                <strong className="mt-1 block text-xl tracking-wider text-ink-900">
                  {referral?.code ?? "Loading…"}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => void share()}
                disabled={!referral}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-crimson-500 px-5 py-3 text-sm font-bold text-white shadow-crimson"
              >
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                {copied ? "Link copied" : "Share invite"}
              </button>
              <button
                type="button"
                aria-label="Copy referral code"
                disabled={!referral}
                onClick={() => {
                  if (referral) void navigator.clipboard.writeText(referral.code);
                  setCopied(true);
                }}
                className="grid h-11 w-11 place-items-center rounded-full border border-ink-200"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat label="Pending delivery" value={referral?.pending ?? 0} />
              <Stat label="Rewards unlocked" value={referral?.rewarded ?? 0} />
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
          <h2 className="text-xl font-bold text-ink-900">Referral activity</h2>
          <p className="mt-1 text-sm text-ink-500">
            No reward is issued for account creation alone. This prevents fake-account abuse and
            keeps the programme sustainable.
          </p>
          {history.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-paper p-5 text-sm text-ink-600">
              Share your link to start earning.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-ink-100">
              {history.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <strong className="block text-ink-900">
                      {item.referee?.name ?? "New customer"}
                    </strong>
                    <small className="text-ink-500">
                      Joined {new Date(item.createdAt).toLocaleDateString()}
                    </small>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "REWARDED" ? "bg-[#EAF7EF] text-[#0B7E58]" : "bg-amber-100 text-amber-800"}`}
                  >
                    {item.status === "REWARDED"
                      ? `+${item.referrerReward} coins`
                      : "Waiting for delivery"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-ink-100 p-4">
      <strong className="block text-2xl text-ink-900">{value}</strong>
      <span className="text-sm text-ink-500">{label}</span>
    </div>
  );
}
