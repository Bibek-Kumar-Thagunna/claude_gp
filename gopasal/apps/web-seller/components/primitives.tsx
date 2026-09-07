import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/* Buttons ------------------------------------------------------------------ */

type ButtonProps = {
  variant?: "primary" | "outline" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = cn(
    "gp-btn",
    size === "sm" && "px-3.5 py-2 text-sm",
    size === "md" && "px-5 py-2.5 text-sm",
    size === "lg" && "px-6 py-3 text-base",
    variant === "primary" && "gp-btn-primary",
    variant === "outline" && "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50",
    variant === "ghost" && "text-ink-700 hover:bg-ink-100",
    variant === "subtle" && "bg-crimson-50 text-crimson-700 hover:bg-crimson-100",
    variant === "danger" && "border border-red-200 bg-white text-[#c02636] hover:bg-red-50",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

/* Cards -------------------------------------------------------------------- */

export function Card({
  className,
  children,
  as: As = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
}) {
  return <As className={cn("gp-panel", className)}>{children}</As>;
}

/* Badges ------------------------------------------------------------------- */

export type Tone = "crimson" | "green" | "marigold" | "blue" | "ink" | "red";

const TONE_BADGE: Record<Tone, string> = {
  crimson: "bg-crimson-50 text-crimson-700",
  green: "bg-[#EAF7EF] text-[#0B7E58]",
  marigold: "bg-[#FFF3DF] text-[#8a5a00]",
  blue: "bg-[#EAF1FE] text-[#1D4ED8]",
  ink: "bg-ink-100 text-ink-700",
  red: "bg-red-50 text-[#c02636]",
};

export function Badge({
  children,
  tone = "ink",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        TONE_BADGE[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* Page header -------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-ink-900 md:text-[1.75rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* Empty / permission states ------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="gp-panel flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
          {icon}
        </span>
      )}
      <h3 className="text-lg font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* Toggle switch ------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-crimson-500" : "bg-ink-200",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
