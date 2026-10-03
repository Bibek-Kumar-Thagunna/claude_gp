"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LockKeyhole, Phone, ShieldCheck, Truck } from "lucide-react";
import { ApiError, apiConfigured, isValidNepalMobile, normalisePhone } from "@gopasal/api-client";
import { Logo } from "@gopasal/ui";
import { useAuth } from "@/components/AuthProvider";
import { requestOtp, verifyOtp } from "@/lib/api/client";
import { riderApi } from "@/lib/api/rider";

const EMPTY_CODE = Array.from({ length: 6 }, () => "");

export default function RiderLoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState(EMPTY_CODE);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (auth.status === "authenticated") router.replace("/");
  }, [auth.status, router]);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await requestOtp(phone);
      setCooldown(result.cooldownSeconds);
      setStep("code");
      setNotice(result.delivered
        ? `A 6-digit code was sent to +977 ${normalisePhone(phone)}.`
        : "SMS delivery is not active in this environment. The code was not sent to the phone.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not request a sign-in code.");
    } finally { setBusy(false); }
  }

  async function verifyCode() {
    setBusy(true); setError(null);
    try {
      const result = await verifyOtp(phone, code.join(""));
      auth.signIn(result.tokens, result.user);
      try {
        await riderApi.profile();
      } catch (cause) {
        await auth.signOut();
        if (cause instanceof ApiError && cause.status === 404) {
          setError("This mobile number is not registered as a GoPasal rider. Ask the shop owner to add you first.");
          return;
        }
        throw cause;
      }
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not verify this code.");
      setCode(EMPTY_CODE);
      window.setTimeout(() => document.getElementById("rider-code-0")?.focus(), 0);
    } finally { setBusy(false); }
  }

  function enterDigit(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    setCode((current) => {
      const next = [...current];
      if (!digits) next[index] = "";
      for (let offset = 0; offset < digits.length && index + offset < 6; offset += 1) next[index + offset] = digits[offset] ?? "";
      return next;
    });
    if (digits) document.getElementById(`rider-code-${Math.min(5, index + digits.length)}`)?.focus();
  }

  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden bg-gradient-to-br from-crimson-700 to-crimson-900 p-12 text-white lg:flex lg:flex-col">
        <Logo variant="full" tone="onDark" height={34} />
        <div className="my-auto max-w-lg">
          <div className="mb-7 inline-flex rounded-2xl bg-white/12 p-4"><Truck className="h-8 w-8" /></div>
          <h1 className="text-5xl font-bold leading-tight text-white">Every delivery, clear and accountable.</h1>
          <p className="mt-5 text-lg leading-8 text-white/80">See only your assigned orders, share live location with consent, record cash, and close each handover securely.</p>
          <div className="mt-9 flex gap-6 text-sm text-white/75">
            <span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Private by design</span>
            <span className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> OTP protected</span>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Logo variant="full" height={31} /></div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-crimson-600">Rider console</p>
          <h2 className="mt-2 text-3xl font-bold">{step === "phone" ? "Sign in securely" : "Enter your code"}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-500">{step === "phone" ? "Use the same Nepal mobile number the shop registered for you." : `Six digits sent for +977 ${normalisePhone(phone)}.`}</p>

          {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {notice && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}</div>}

          {step === "phone" ? (
            <form className="mt-7" onSubmit={(event) => { event.preventDefault(); if (isValidNepalMobile(phone)) void sendCode(); }}>
              <label className="text-sm font-semibold">Mobile number</label>
              <div className="mt-2 flex h-14 items-center rounded-xl border bg-white px-4 focus-within:border-crimson-400">
                <Phone className="h-5 w-5 text-ink-400" /><span className="ml-3 text-ink-500">+977</span>
                <input autoFocus inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="98XXXXXXXX" className="h-full min-w-0 flex-1 bg-transparent px-2 outline-none" />
              </div>
              <button className="rider-button rider-primary mt-5 w-full" disabled={!apiConfigured() || !isValidNepalMobile(phone) || busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Send secure code
              </button>
            </form>
          ) : (
            <form className="mt-7" onSubmit={(event) => { event.preventDefault(); if (code.every(Boolean)) void verifyCode(); }}>
              <div className="grid grid-cols-6 gap-2">
                {code.map((digit, index) => (
                  <input key={index} id={`rider-code-${index}`} autoFocus={index === 0} value={digit} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} aria-label={`Digit ${index + 1}`} maxLength={6} onChange={(event) => enterDigit(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && !digit && index > 0) document.getElementById(`rider-code-${index - 1}`)?.focus(); }} className="h-14 min-w-0 rounded-xl border bg-white text-center text-xl font-bold outline-none focus:border-crimson-400" />
                ))}
              </div>
              <button className="rider-button rider-primary mt-5 w-full" disabled={!code.every(Boolean) || busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Verify and continue</button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep("phone"); setCode(EMPTY_CODE); setError(null); }} className="flex items-center gap-1 font-semibold text-ink-600"><ArrowLeft className="h-4 w-4" /> Change number</button>
                <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="font-semibold text-crimson-600 disabled:text-ink-400">{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>
              </div>
            </form>
          )}
          <p className="mt-10 text-xs leading-5 text-ink-400">Location is shared only after you switch it on during an active delivery. GoPasal never fabricates your position.</p>
        </div>
      </section>
    </main>
  );
}
