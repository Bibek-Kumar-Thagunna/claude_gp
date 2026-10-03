import * as React from "react";
import { AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { Logo } from "@gopasal/ui";
import { Button, Card } from "@/components/primitives";
import { cn } from "@/lib/cn";

/**
 * The three states every screen that talks to the API has to be able to show.
 * They live in one place so "loading", "failed" and "nothing here yet" look the
 * same everywhere instead of being reinvented per page.
 */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden />;
}

export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-ink-500">
      <Spinner className="h-5 w-5 text-crimson-500" />
      <span role="status">{label}</span>
    </Card>
  );
}

/** Full-screen, brand-light boot state used only while restoring a session. */
export function ConsoleBoot({
  label,
  surface = "Seller centre",
}: {
  label: string;
  surface?: string;
}) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fbf9f8] px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(232,24,75,0.08),transparent_34%)]" />
      <div className="relative flex w-full max-w-xs flex-col items-center text-center">
        <Logo variant="full" height={36} />
        <span className="mt-3 rounded-full border border-crimson-100 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson-600">
          {surface}
        </span>
        <div className="mt-9 h-1 w-44 overflow-hidden rounded-full bg-ink-100" aria-hidden>
          <div className="h-full w-1/2 animate-pulse rounded-full bg-crimson-500" />
        </div>
        <p className="mt-4 text-sm text-ink-500" role="status" aria-live="polite">
          {label}
        </p>
      </div>
    </div>
  );
}

/** Skeleton rows, for when the shape of what is coming is already known. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="gp-skeleton h-16 rounded-xl" />
      ))}
    </div>
  );
}

export function ErrorPanel({
  title = "Something went wrong",
  message,
  offline,
  onRetry,
  retryLabel = "Try again",
  children,
}: {
  title?: string;
  message: string;
  offline?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  children?: React.ReactNode;
}) {
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <Card className="px-6 py-10 text-center">
      <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#c02636]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">{message}</p>
      {children && <div className="mt-4">{children}</div>}
      {onRetry && (
        <div className="mt-5">
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** An inline, non-blocking message — for a failed save above a form. */
export function InlineError({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-[#c02636]",
        className,
      )}
    >
      <p className="font-medium">{message}</p>
      {children}
    </div>
  );
}

export function InlineNotice({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-600",
        className,
      )}
    >
      <p>{message}</p>
      {children}
    </div>
  );
}

export function InlineWarning({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900",
        className,
      )}
    >
      <p className="font-medium">{message}</p>
      {children}
    </div>
  );
}
