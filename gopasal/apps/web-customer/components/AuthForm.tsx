"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Phone, ShieldCheck, Store, User } from "lucide-react";
import { ApiError, isValidNepalMobile, normalisePhone } from "@gopasal/api-client";
import { Logo } from "@gopasal/ui";
import { requestOtp, verifyOtp } from "@/lib/api/client";
import { customerApi } from "@/lib/api/customer";
import { useAuth } from "@/components/providers";

type Step = "enter" | "otp" | "name" | "done";

export function AuthForm() {
  const router = useRouter();
  const auth = useAuth();
  const [step, setStep] = React.useState<Step>("enter");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [developmentCode, setDevelopmentCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function sendCode() {
    if (!isValidNepalMobile(phone)) return;
    setBusy(true); setError(null);
    try {
      const result = await requestOtp(phone);
      setDevelopmentCode(result.developmentCode ?? null);
      setMessage(result.delivered
        ? `A 6-digit code was sent to +977 ${normalisePhone(phone)}.`
        : "SMS delivery is intentionally local in this development environment. Use the development code below.");
      setStep("otp");
    } catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  }

  async function checkCode() {
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true); setError(null);
    try {
      const result = await verifyOtp(phone, code);
      await auth.signIn(result.tokens, result.user);
      if (result.isNewUser || !result.user.name) setStep("name");
      else setStep("done");
    } catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  }

  async function saveName() {
    if (name.trim().length < 2) return;
    setBusy(true); setError(null);
    try { await customerApi.updateProfile({ name: name.trim() }); await auth.reload(); setStep("done"); }
    catch (cause) { setError(readError(cause)); }
    finally { setBusy(false); }
  }

  return (
    <section className="relative overflow-hidden bg-crimson-glow">
      <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="gp-container flex min-h-[calc(100dvh-68px)] items-center justify-center py-10">
        <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] bg-white shadow-card ring-1 ring-ink-100 lg:grid-cols-[1.05fr_1fr]">
          <aside className="hidden bg-gradient-to-br from-crimson-600 to-[#B00D30] p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <Logo variant="full" tone="onDark" height={34} />
            <div>
              <p className="deva text-sm font-semibold text-white/80">नेपालको आफ्नै पसल</p>
              <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight">Your neighbourhood shops, one tap away.</h1>
              <ul className="mt-8 space-y-4 text-sm text-white/90">
                <li className="flex gap-3"><ShieldCheck className="h-5 w-5" /> Secure, expiring one-time-code sign-in</li>
                <li className="flex gap-3"><Store className="h-5 w-5" /> Verified local shops and persisted orders</li>
              </ul>
            </div>
            <p className="text-xs text-white/60">© 2026 GoPasal · Kathmandu, Nepal</p>
          </aside>

          <section className="flex items-center justify-center px-5 py-12 sm:px-10">
            <div className="w-full max-w-[26rem]">
              {step !== "enter" && step !== "done" && (
                <button onClick={() => setStep(step === "name" ? "otp" : "enter")} className="mb-6 inline-flex items-center gap-1 text-sm text-ink-500">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}

              {step === "enter" && <form onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
                <h2 className="font-display text-3xl font-extrabold text-ink-900">Log in or sign up</h2>
                <p className="mt-2 text-sm text-ink-500">Use a Nepal mobile number. New accounts are created only after the code is verified.</p>
                <label className="mt-7 block text-sm font-semibold text-ink-700">Phone number</label>
                <div className="mt-1.5 flex items-center rounded-xl border border-ink-200 px-3 focus-within:border-crimson-400 focus-within:ring-4 focus-within:ring-crimson-100">
                  <Phone className="h-4 w-4 text-crimson-500" /><span className="ml-2 font-semibold">+977</span>
                  <input autoFocus value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="98XXXXXXXX" className="h-12 flex-1 bg-transparent px-3 outline-none" />
                </div>
                <Action disabled={!isValidNepalMobile(phone) || busy}>Send secure code <ArrowRight className="h-4 w-4" /></Action>
              </form>}

              {step === "otp" && <form onSubmit={(event) => { event.preventDefault(); void checkCode(); }}>
                <h2 className="font-display text-2xl font-bold text-ink-900">Enter the 6-digit code</h2>
                <p className="mt-2 text-sm text-ink-500">{message}</p>
                {developmentCode && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center"><p className="text-xs font-bold uppercase tracking-wider text-amber-800">Development OTP · not sent by SMS</p><p className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-ink-900">{developmentCode}</p></div>}
                <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mt-7 h-16 w-full rounded-2xl border border-ink-200 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-100" />
                <Action disabled={!/^\d{6}$/.test(code) || busy}>Verify & continue <ArrowRight className="h-4 w-4" /></Action>
                <button type="button" disabled={busy} onClick={() => void sendCode()} className="mt-4 w-full text-sm font-semibold text-crimson-600">Resend code</button>
              </form>}

              {step === "name" && <form onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
                <User className="mb-5 h-8 w-8 text-crimson-600" />
                <h2 className="font-display text-2xl font-bold text-ink-900">Welcome to GoPasal</h2>
                <p className="mt-2 text-sm text-ink-500">Your phone is verified. Add the name shops should see on your orders.</p>
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="mt-6 h-12 w-full rounded-xl border border-ink-200 px-4 outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-100" />
                <Action disabled={name.trim().length < 2 || busy}>Save profile <ArrowRight className="h-4 w-4" /></Action>
              </form>}

              {step === "done" && <div className="text-center">
                <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF7EF] text-[#0B7E58]"><Check className="h-8 w-8" /></span>
                <h2 className="mt-6 font-display text-2xl font-bold text-ink-900">You’re signed in</h2>
                <p className="mt-2 text-sm text-ink-500">Your authenticated customer session is ready.</p>
                <button onClick={() => router.push(readSafeReturnTo())} className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-full bg-crimson-500 font-semibold text-white">Continue</button>
              </div>}

              {error && <p role="alert" className="mt-5 rounded-xl bg-crimson-50 px-4 py-3 text-sm text-crimson-700">{error}</p>}
              <p className="mt-7 text-center text-xs text-ink-400">By continuing you agree to our <Link href="/legal/terms" className="underline">Terms</Link> and <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.</p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function Action({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  return <button type="submit" disabled={disabled} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-crimson-500 font-semibold text-white shadow-crimson disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

function readError(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function readSafeReturnTo() {
  const fallback = "/shops";
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname !== "/login" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export default AuthForm;
