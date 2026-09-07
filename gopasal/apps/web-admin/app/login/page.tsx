"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "@gopasal/ui";
import {
  Phone,
  ArrowRight,
  ShieldCheck,
  ScrollText,
  KeyRound,
  Scale,
  Lock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/primitives";
import { InlineError, InlineNotice, InlineWarning } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import {
  ApiError,
  NO_API_MESSAGE,
  apiConfigured,
  isValidNepalMobile,
  normalisePhone,
} from "@gopasal/api-client";
import { requestOtp, verifyOtp } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/**
 * Platform staff sign-in, against the real API.
 *
 * `POST /auth/otp/request` → `POST /auth/otp/verify` with `surface: "admin"`, then
 * `GET /auth/me` (via `AuthProvider.signIn`) to find out what this account may
 * actually do. There is no self-signup and no separate staff password store: the
 * phone is the identifier, and platform standing comes entirely from the
 * memberships the API reports.
 *
 * Which means the honest failure case has to be handled here rather than hidden:
 * a seller's phone will authenticate perfectly well and come back with no
 * platform role at all. Rather than dropping them onto a dashboard that 403s panel
 * by panel, this screen says so and signs them back out.
 */

const CODE_LENGTH = 4;
const LANDING = "/dashboard";

export default function LoginPage() {
  const router = useRouter();
  const { status, me, isStaff, signIn, signOut } = useAuth();
  const configured = apiConfigured();

  const [step, setStep] = React.useState<"phone" | "otp">("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ""));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [notStaff, setNotStaff] = React.useState(false);
  const [challenge, setChallenge] = React.useState<{
    delivered: boolean;
    expiresInSeconds: number;
  } | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  const valid = isValidNepalMobile(phone);
  const fullCode = code.join("");

  // Already signed in with real platform standing — nothing to do here.
  React.useEffect(() => {
    if (status === "authenticated" && me && isStaff) router.replace(LANDING);
  }, [status, me, isStaff, router]);

  // The API owns the resend cooldown and tells us how long it is; the button
  // reflects that number rather than inventing one.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const send = React.useCallback(
    async (resend = false) => {
      setBusy(true);
      setError(null);
      setNotStaff(false);
      try {
        const result = await requestOtp(phone);
        setChallenge({ delivered: result.delivered, expiresInSeconds: result.expiresInSeconds });
        setCooldown(result.cooldownSeconds);
        setStep("otp");
        if (resend) setCode(Array.from({ length: CODE_LENGTH }, () => ""));
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError({ status: 0, message: "Could not send the code." });
        setError(apiErr);
        // A 429 means a code is already live for this number, so the code screen
        // is still the right place to be — there is just a wait before asking again.
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
    setNotStaff(false);
    try {
      const result = await verifyOtp(phone, fullCode);
      const next = await signIn(result.tokens, result.user);
      // `signIn` returns null when `/auth/me` could not be read; the provider is
      // holding the error and `RequireAuth` will surface it, so still move on.
      if (next && !next.access.superAdmin && next.access.platform.length === 0) {
        setNotStaff(true);
        await signOut();
        setCode(Array.from({ length: CODE_LENGTH }, () => ""));
        setStep("phone");
        return;
      }
      router.replace(LANDING);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError({ status: 0, message: "Could not verify the code." }),
      );
      setCode(Array.from({ length: CODE_LENGTH }, () => ""));
      window.setTimeout(() => document.getElementById("otp-0")?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }, [phone, fullCode, signIn, signOut, router]);

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
      <div className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(150deg, #2A0710 0%, #8A0B27 55%, #E11945 100%)" }}
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden
        />
        <div className="relative">
          <Logo variant="full" tone="onDark" height={34} />
        </div>

        <div className="relative my-auto max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            <Lock className="h-3.5 w-3.5" /> Internal console
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight">The platform control room.</h1>
          <p className="mt-4 text-lg text-white/85">
            Approve shops, keep the marketplace honest, settle cash, and publish policy — every action
            recorded, every permission explicit.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: ShieldCheck, text: "Default-deny permissions — staff see only their own remit" },
              { icon: Scale, text: "Disputes, fraud and moderation queues in one place" },
              { icon: KeyRound, text: "Build your own roles, granular to a single action" },
              { icon: ScrollText, text: "Tamper-evident audit trail on every change" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/70">
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
              {step === "phone" ? "Staff sign in" : "Verify your number"}
            </h2>
            <p className="mt-1.5 text-sm text-ink-500">
              {step === "phone"
                ? "Use the mobile number registered to your platform account."
                : `We sent a ${CODE_LENGTH}-digit code to +977 ${normalisePhone(phone)}.`}
            </p>

            {!configured && (
              <div className="mt-6">
                <InlineError message={NO_API_MESSAGE} />
              </div>
            )}

            {notStaff && (
              <div className="mt-6">
                <InlineWarning message="That number signed in, but the account has no GoPasal platform role — so there is nothing in this console for it.">
                  <p className="mt-1 text-xs">
                    A Super Admin can grant one under Roles &amp; permissions. If you were looking for
                    the seller console, sign in there instead.
                  </p>
                </InlineWarning>
              </div>
            )}

            {error && (
              <div className="mt-6">
                <InlineError message={error.message} />
              </div>
            )}

            {step === "phone" ? (
              <form
                className="mt-8 space-y-4"
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
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setError(null);
                        setNotStaff(false);
                      }}
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

                <p className="rounded-xl bg-ink-50 px-3.5 py-3 text-xs leading-relaxed text-ink-500">
                  Platform accounts are created by a Super Admin. If you can’t sign in, ask them to check
                  your role under Roles &amp; permissions.
                </p>
              </form>
            ) : (
              <form
                className="mt-8 space-y-5"
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
                        "h-14 w-14 rounded-xl border border-ink-200 bg-white text-center text-xl font-bold outline-none focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100",
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

                <div className="flex items-center justify-center gap-4 text-sm">
                  <button
                    type="button"
                    disabled={cooldown > 0 || busy}
                    onClick={() => void send(true)}
                    className={cn(
                      "font-medium",
                      cooldown > 0 || busy ? "text-ink-400" : "text-crimson-600 hover:underline",
                    )}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                  <span className="text-ink-300">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setCode(Array.from({ length: CODE_LENGTH }, () => ""));
                      setError(null);
                      setChallenge(null);
                    }}
                    className="font-medium text-crimson-600 hover:underline"
                  >
                    Change number
                  </button>
                </div>
              </form>
            )}

            <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Sign-ins and every console action are written to the audit log.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
