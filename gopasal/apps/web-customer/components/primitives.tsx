import * as React from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("gp-container", className)}>{children}</div>;
}

type ButtonProps = {
  variant?: "primary" | "outline" | "ghost";
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
    size === "sm" && "px-4 py-2 text-sm",
    size === "md" && "px-5 py-2.5 text-sm md:text-base",
    size === "lg" && "px-7 py-3.5 text-base md:text-lg",
    variant === "primary" && "gp-btn-primary",
    variant === "outline" &&
      "border border-crimson-200 bg-white text-crimson-700 hover:bg-crimson-50",
    variant === "ghost" && "text-ink-700 hover:bg-ink-100",
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

export function Badge({
  children,
  tone = "crimson",
  className,
}: {
  children: React.ReactNode;
  tone?: "crimson" | "green" | "marigold" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "crimson" && "bg-crimson-50 text-crimson-700",
        tone === "green" && "bg-[#EAF7EF] text-[#0B7E58]",
        tone === "marigold" && "bg-[#FFF3DF] text-[#8a5a00]",
        tone === "ink" && "bg-ink-100 text-ink-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Rating({ value, reviews }: { value: number; reviews?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-ink-700">
      <Star className="h-4 w-4 fill-[#F6A609] text-[#F6A609]" aria-hidden />
      {value.toFixed(1)}
      {reviews != null && <span className="text-ink-400">({reviews.toLocaleString("en-IN")})</span>}
    </span>
  );
}
