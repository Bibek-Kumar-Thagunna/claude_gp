import * as React from "react";
import { AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { Button, Card } from "@/components/primitives";
import { cn } from "@/lib/cn";

/**
 * The three states every screen that talks to the API has to be able to show.
 * They live in one place so "loading", "failed" and "nothing here yet" look the
 * same everywhere instead of being reinvented per page.
 *
 * The same file exists in the seller console; the two consoles have separate
 * design-system copies (`components/primitives.tsx`) and these are built on top
 * of each app's own, so they are deliberately not shared.
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

/** Skeleton rows, for when the shape of what is coming is already known. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
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

/** An inline, non-blocking message — for a failed action above a panel. */
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

/** A warning that is not an error — an unmet precondition, say. */
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
      className={cn(
        "rounded-xl border border-[#F3D9A6] bg-[#FFF3DF] px-4 py-3 text-sm text-[#8a5a00]",
        className,
      )}
    >
      <p className="font-medium">{message}</p>
      {children}
    </div>
  );
}
