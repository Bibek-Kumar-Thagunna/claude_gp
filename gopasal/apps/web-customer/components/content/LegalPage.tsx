import * as React from "react";
import Link from "next/link";
import { Container } from "@/components/primitives";
import { cn } from "@/lib/cn";

/**
 * Shared layout for GoPasal legal & policy pages.
 *
 * Renders a crimson-tinted, dot-grid page header followed by a readable
 * max-w-3xl prose column. Because the Tailwind typography plugin is NOT
 * installed, nested elements are styled manually with arbitrary variants.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-20">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-14 md:py-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-crimson-50 px-3 py-1 text-xs font-semibold text-crimson-700">
              GoPasal · Legal
            </span>
            <h1 className="mt-4 text-4xl font-extrabold text-ink-900 md:text-5xl">{title}</h1>
            <p className="mt-3 text-sm font-medium text-ink-500">Last updated: {updated}</p>
            {intro && <p className="mt-5 text-lg leading-relaxed text-ink-600">{intro}</p>}
          </div>
        </Container>
      </header>

      {/* Body */}
      <Container className="relative py-12 md:py-16">
        <article
          className={cn(
            "max-w-3xl",
            "[&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-ink-600",
            "[&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink-900",
            "[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-ink-900",
            "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-ink-600",
            "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ol]:text-ink-600",
            "[&_li]:leading-relaxed [&_li>strong]:text-ink-800",
            "[&_a]:font-semibold [&_a]:text-crimson-600 [&_a:hover]:underline",
            "[&_strong]:font-semibold [&_strong]:text-ink-800",
          )}
        >
          {children}
        </article>
      </Container>
    </div>
  );
}

/** A titled section with an anchor-able heading. */
export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 id={id}>
        {id ? (
          <Link href={`#${id}`} className="!text-ink-900 !no-underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </h2>
      {children}
    </section>
  );
}

export default LegalPage;
