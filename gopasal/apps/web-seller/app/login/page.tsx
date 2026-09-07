"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "@gopasal/ui";
import {
  Phone,
  ArrowRight,
  ShieldCheck,
  Store,
  Truck,
  BarChart3,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/primitives";
import { InlineError, InlineNotice } from "@/components/states";
import { landingPath, useAuth } from "@/components/auth-provider";
import {
  ApiError,
  NO_API_MESSAGE,
  apiConfigured,
  isValidNepalMobile,
  normalisePhone,
} from "@gopasal/api-client";
import { requestOtp, verifyOtp } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const CODE_LENGTH = 4;

export default function LoginPage() {
  const router = useRouter();
  const { status, me, signIn } = useAuth();
  const configured = apiConfigured();

  const [step, setStep] = React.useState<"phone" | "otp">("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ""));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [challenge, setChallenge] = React.useState<{
    delivered: boolean;
    expiresInSeconds: number;
  } | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  const valid = isValidNepalMobile(phone);
  const fullCode = code.join("");

  // Already signed in — nothing to do here but move on.
  React.useEffect(() => {
    if (status === "authenticated" && me) router.replace(landingPath(me));
  }, [status, me, router]);

  // The API enforces a resend cooldown and tells us how long it is; the button
  // reflects that rather than inventing its own number.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const send = React.useCallback(
    async (resend = false) => {
      setBusy(true);
      setError(null);
      try {
        const result = await requestOtp(phone);
        setChallenge({ delivered: result.delivered, expiresInSeconds: result.expiresInSeconds });
        setCooldown(result.cooldownSeconds);
        setStep("otp");
        if (resend) setCode(Array.from({ length: CODE_LENGTH }, () => ""));
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError({ status: 0, message: "Could not send the code." });
        setError(apiErr);
        // A 429 means a code is already live for this number, so the next screen
        // is still the right one — the seller just has to wait to ask again.
        if (apiErr.status === 429) {
          setStep("otp");
          const wait = apiErr.message.match(/(\d+)\s*second/);
          setCooldown(wait?.[1] ? Number(wait[1]) : 60);
        }
      } finally {
        setBusy(false);
      }
    },
    [phone],
  );

  const verify = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, fullCode);
      const next = await signIn(result.tokens, result.user);
      router.replace(landingPath(next));
    } catch (err) {
      /*
        The fallback keeps its own wording rather than going through `asApiError`:
        anything that is not an `ApiError` here is a client-side throw the seller can
        do nothing with, and "Could not verify the code." is the true summary. Its
        status stays 0, which is what the check below relies on.
      */
      const apiErr =
        err instanceof ApiError
          ? err
          : new ApiError({ status: 0, message: "Could not verify the code." });
      setError(apiErr);
      /*
        Only a rejection of the digits themselves clears them. `POST /auth/otp/verify`
        answers 400 for a code that is expired or incorrect and 429 for too many
        attempts, and in all three the digits on screen are spent. A transport
        failure, a 5xx or an offline browser says nothing about the code — wiping six
        boxes the seller has just typed would make them re-enter a code that is very
        probably still valid.
      */
      if (apiErr.status === 400 || apiErr.status === 429) {
        setCode(Array.from({ length: CODE_LENGTH }, () => ""));
        window.setTimeout(() => document.getElementById("otp-0")?.focus(), 0);
      }
    } finally {
      setBusy(false);
    }
  }, [phone, fullCode, signIn, router]);

  const setDigit = (index: number, raw: string): void => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setCode((prev) => prev.map((v, i) => (i === index ? "" : v)));
      return;
    }
    // Pasting the whole code into any box should fill the row.
    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < digits.length && index + i < CODE_LENGTH; i += 1) {
        next[index + i] = digits[i] as string;
      }
      return next;
    });
    const landing = Math.min(index + digits.length, CODE_LENGTH - 1);
    document.getElementById(`otp-${landing}`)?.focus();
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-crimson-600 to-crimson-800 p-12 text-white lg:flex lg:flex-col">
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden
        />
        <Logo variant="full" tone="onDark" height={34} />
        <div className="my-auto max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Grow your shop with GoPasal.</h1>
          <p className="mt-4 text-lg text-white/85">
            One account for every shop you run. Take orders, manage your own delivery, and see how
            your business is doing — all in one place.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Store, text: "Manage multiple shops from one login" },
              { icon: Truck, text: "Self-delivery with proof-of-delivery & cash tracking" },
              { icon: ShieldCheck, text: "Custom roles — give staff exactly the access they need" },
              { icon: BarChart3, text: "Per-shop and combined analytics" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/70">
          Operated by Velayon Dynamics Pvt. Ltd., registered in Nepal.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo variant="full" height={30} />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8"
          >
            <h2 className="text-2xl font-bold text-ink-900">
              {step === "phone" ? "Seller sign in" : "Verify your number"}
            </h2>
            <p className="mt-1.5 text-sm text-ink-500">
              {step === "phone"
                ? "Enter your mobile number and we'll send you a code."
                : `We sent a ${CODE_LENGTH}-digit code to +977 ${normalisePhone(phone)}.`}
            </p>

            {!configured && (
              <div className="mt-6">
                <InlineError message={NO_API_MESSAGE} />
              </div>
            )}

            {error && (
              <div className="mt-6">
                <InlineError message={error.message} />
              </div>
            )}

            {step === "phone" ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid && !busy && configured) void send();
                }}
              >
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Mobile number</span>
                  <div className="flex items-center rounded-xl border border-ink-200 bg-white px-3 focus-within:border-crimson-300">
                    <Phone className="h-4 w-4 text-ink-400" aria-hidden />
                    <span className="ml-2 text-sm text-ink-500">+977</span>
                    <input
                      autoFocus
                      name="phone"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="98XXXXXXXX"
                      aria-label="Mobile number"
                      className="ml-2 h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
                    />
                  </div>
                </label>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={!valid || busy || !configured}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      Send code <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form
                className="mt-6 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (fullCode.length === CODE_LENGTH && !busy) void verify();
                }}
              >
                <div className="flex justify-center gap-3">
                  {code.map((v, i) => (
                    <input
                      key={i}
                      id={`otp-${i}`}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus={i === 0}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-label={`Digit ${i + 1}`}
                      value={v}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !v && i > 0) {
                          document.getElementById(`otp-${i - 1}`)?.focus();
                        }
                      }}
                      className={cn(
                        "h-14 w-14 rounded-xl border border-ink-200 bg-white text-center text-xl font-bold outline-none focus:border-crimson-400",
                        error?.isValidation && "border-red-200",
                      )}
                    />
                  ))}
                </div>

                {challenge && !challenge.delivered && (
                  <InlineNotice message="SMS delivery is switched off in this environment, so the code is printed in the API log instead of being texted to you.">
                    <p className="mt-1 text-xs text-ink-500">
                      It expires in {Math.round(challenge.expiresInSeconds / 60)} minutes.
                    </p>
                  </InlineNotice>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={fullCode.length !== CODE_LENGTH || busy}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                    </>
                  ) : (
                    "Verify & continue"
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setError(null);
                      setChallenge(null);
                    }}
                    className="font-medium text-crimson-600 hover:underline"
                  >
                    Change number
                  </button>
                  <button
                    type="button"
                    disabled={cooldown > 0 || busy}
                    onClick={() => void send(true)}
                    className="font-medium text-ink-500 hover:text-ink-800 disabled:cursor-not-allowed disabled:text-ink-300"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-8 flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <p>
                New to GoPasal? Sign in with your mobile number — we&apos;ll walk you through
                registering your shop straight after.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
