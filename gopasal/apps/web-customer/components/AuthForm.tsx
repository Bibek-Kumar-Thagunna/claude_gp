"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "@gopasal/ui";
import {
  ShieldCheck,
  MessageCircle,
  Store,
  ArrowRight,
  ArrowLeft,
  Mail,
  Phone,
  Check,
  User,
} from "lucide-react";

const TRUST = [
  { icon: ShieldCheck, text: "Verified local shops, safe payments" },
  { icon: MessageCircle, text: "Chat directly with the shopkeeper" },
  { icon: Store, text: "1,200+ kirana, pharmacy & fresh shops" },
];

/**
 * Demo stand-in for the backend "does this account already exist?" check.
 * After OTP verification the real API tells us whether the phone/email is a
 * returning user; returning users skip straight in, new users are asked for a
 * name once. Numbers in this set behave as "already registered" so both paths
 * are demoable — replace with the real lookup when the auth backend is wired.
 */
const REGISTERED_DEMO = new Set(["9812345678", "9800000000"]);
function isReturningUser(identifier: string) {
  return REGISTERED_DEMO.has(identifier.replace(/\D/g, ""));
}

type Step = "enter" | "otp" | "name" | "done";

/**
 * AuthForm — single, unified customer entry. There is no separate "create
 * account": the user enters a phone (Nepal convention; email optional), we
 * send a 4-digit OTP, and only *new* numbers are asked for a full name. Returning
 * numbers go straight in. Frontend-only: verifying advances the local step;
 * wire the handlers to the real auth backend when available.
 */
export function AuthForm() {
  const [step, setStep] = React.useState<Step>("enter");
  const [useEmail, setUseEmail] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [otp, setOtp] = React.useState(["", "", "", ""]);
  const otpRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const identifier = useEmail ? email : phone;
  const phoneOk = phone.replace(/\D/g, "").length === 10;
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const canContinue = useEmail ? emailOk : phoneOk;
  const otpOk = otp.every((d) => d !== "");
  const nameOk = name.trim().length >= 2;
  const contactLabel = useEmail ? "email" : "phone";
  const prettyContact = useEmail ? email : `+977 ${phone}`;

  function setOtpAt(idx: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 3) otpRefs.current[idx + 1]?.focus();
  }

  function onOtpKey(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  // OTP verified → returning users are done; new users give a name once.
  function verifyOtp() {
    if (!otpOk) return;
    setStep(isReturningUser(identifier) ? "done" : "name");
  }

  return (
    <section className="relative overflow-hidden bg-crimson-glow">
      <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -right-32 -top-28 h-[30rem] w-[30rem] rounded-full bg-crimson-200/50 blur-3xl" />
      <div className="gp-container flex min-h-[calc(100dvh-68px)] items-center justify-center py-10 md:py-14">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] bg-white shadow-card ring-1 ring-ink-100 lg:grid-cols-[1.05fr_1fr]">
          {/* ---- brand panel (hidden on small screens) ---- */}
          <aside className="relative hidden overflow-hidden bg-gradient-to-br from-crimson-600 via-crimson-500 to-[#B00D30] p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-[#F6A609]/20 blur-3xl" />
            <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-20" />

            <Link href="/" className="relative inline-flex w-fit">
              <Logo variant="full" tone="onDark" height={34} />
            </Link>

            <div className="relative max-w-md">
              <p className="deva mb-3 text-sm font-semibold text-white/80">नेपालको आफ्नै पसल</p>
              <h1 className="font-display text-4xl font-extrabold leading-tight">
                Your neighbourhood shops, one tap away.
              </h1>
              <ul className="mt-8 space-y-4">
                {TRUST.map((f) => (
                  <li key={f.text} className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm text-white/90">{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="relative text-xs text-white/60">© 2026 GoPasal · Kathmandu, Nepal</p>
          </aside>

          {/* ---- form panel ---- */}
          <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-10">
            <div className="w-full max-w-[26rem]">
              <Link href="/" className="mb-8 inline-flex lg:hidden" aria-label="GoPasal home">
                <Logo variant="full" height={30} />
              </Link>

              {step === "enter" && (
                <div>
                  <h2 className="font-display text-3xl font-extrabold text-ink-900">
                    Log in or sign up
                  </h2>
                  <p className="mt-2 text-sm text-ink-500">
                    Enter your {contactLabel} and we&apos;ll send a code. New here? You&apos;ll be set
                    up in seconds — no separate sign-up.
                  </p>

                  <form
                    className="mt-7 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (canContinue) setStep("otp");
                    }}
                  >
                    {useEmail ? (
                      <Field label="Email address">
                        <div className="flex items-center rounded-xl border border-ink-200 bg-white pl-3 transition focus-within:border-crimson-400 focus-within:ring-4 focus-within:ring-crimson-100">
                          <Mail className="h-4 w-4 shrink-0 text-ink-400" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="h-12 w-full bg-transparent px-3 text-sm outline-none"
                          />
                        </div>
                      </Field>
                    ) : (
                      <Field label="Phone number">
                        <div className="flex items-center rounded-xl border border-ink-200 bg-white pl-3 transition focus-within:border-crimson-400 focus-within:ring-4 focus-within:ring-crimson-100">
                          <span className="flex shrink-0 items-center gap-1.5 pr-2 text-sm font-semibold text-ink-700">
                            <Phone className="h-4 w-4 text-crimson-500" /> +977
                          </span>
                          <span className="h-6 w-px bg-ink-200" />
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                            placeholder="98XXXXXXXX"
                            className="h-12 w-full bg-transparent px-3 text-sm outline-none"
                          />
                        </div>
                      </Field>
                    )}

                    <button
                      type="submit"
                      disabled={!canContinue}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-crimson-500 text-base font-semibold text-white shadow-crimson transition enabled:hover:bg-crimson-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Continue <ArrowRight className="h-4 w-4" />
                    </button>
                  </form>

                  <div className="my-6 flex items-center gap-3 text-xs font-medium text-ink-400">
                    <span className="h-px flex-1 bg-ink-200" /> OR{" "}
                    <span className="h-px flex-1 bg-ink-200" />
                  </div>

                  <button
                    onClick={() => setUseEmail((v) => !v)}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink-200 bg-white text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
                  >
                    {useEmail ? (
                      <>
                        <Phone className="h-4 w-4 text-crimson-500" /> Continue with phone
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 text-crimson-500" /> Continue with email
                      </>
                    )}
                  </button>

                  <p className="mt-7 text-center text-xs leading-relaxed text-ink-400">
                    By continuing you agree to GoPasal&apos;s{" "}
                    <Link href="/legal/terms" className="underline hover:text-ink-600">Terms</Link> and{" "}
                    <Link href="/legal/privacy" className="underline hover:text-ink-600">Privacy Policy</Link>.
                  </p>
                </div>
              )}

              {step === "otp" && (
                <div>
                  <button
                    onClick={() => setStep("enter")}
                    className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-800"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <h2 className="font-display text-2xl font-bold text-ink-900">Enter the code</h2>
                  <p className="mt-2 text-sm text-ink-500">
                    We sent a 4-digit code to your {contactLabel}{" "}
                    <span className="font-semibold text-ink-800">{prettyContact}</span>.
                  </p>

                  <div className="mt-7 flex gap-3">
                    {otp.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={(e) => setOtpAt(i, e.target.value)}
                        onKeyDown={(e) => onOtpKey(i, e)}
                        aria-label={`Digit ${i + 1}`}
                        className="h-16 w-full rounded-2xl border border-ink-200 bg-white text-center text-2xl font-bold text-ink-900 outline-none transition focus:border-crimson-400 focus:ring-4 focus:ring-crimson-100"
                      />
                    ))}
                  </div>

                  <button
                    disabled={!otpOk}
                    onClick={verifyOtp}
                    className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-crimson-500 text-base font-semibold text-white shadow-crimson transition enabled:hover:bg-crimson-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Verify &amp; continue <ArrowRight className="h-4 w-4" />
                  </button>
                  <p className="mt-4 text-center text-sm text-ink-500">
                    Didn&apos;t get it?{" "}
                    <button className="font-semibold text-crimson-600 hover:underline">
                      Resend code
                    </button>
                  </p>
                </div>
              )}

              {step === "name" && (
                <div>
                  <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <User className="h-6 w-6" />
                  </span>
                  <h2 className="font-display text-2xl font-bold text-ink-900">
                    Welcome to GoPasal! 🙏
                  </h2>
                  <p className="mt-2 text-sm text-ink-500">
                    Your {contactLabel} is verified. What should we call you? You&apos;ll only do this
                    once.
                  </p>

                  <form
                    className="mt-6"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (nameOk) setStep("done");
                    }}
                  >
                    <Field label="Full name">
                      <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Sita Sharma"
                        className="h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-sm outline-none transition focus:border-crimson-400 focus:ring-4 focus:ring-crimson-100"
                      />
                    </Field>
                    <button
                      type="submit"
                      disabled={!nameOk}
                      className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-crimson-500 text-base font-semibold text-white shadow-crimson transition enabled:hover:bg-crimson-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Create account <ArrowRight className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              )}

              {step === "done" && (
                <div className="text-center">
                  <span className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF7EF] text-[#0B7E58]">
                    <Check className="h-8 w-8" />
                  </span>
                  <h2 className="font-display text-2xl font-bold text-ink-900">
                    {name.trim() ? `Namaste, ${name.trim().split(" ")[0]}!` : "You're all set!"}
                  </h2>
                  <p className="mt-2 text-sm text-ink-500">
                    Verified <span className="font-semibold text-ink-800">{prettyContact}</span>. Start
                    ordering from shops near you.
                  </p>
                  <Link
                    href="/"
                    className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-crimson-500 text-base font-semibold text-white shadow-crimson transition hover:bg-crimson-600"
                  >
                    Start shopping <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  );
}

export default AuthForm;
