import type { Metadata } from "next";
import Link from "next/link";
import {
  Mail,
  Phone,
  MessageCircle,
  Truck,
  RotateCcw,
  ShieldCheck,
  HelpCircle,
  FileText,
  ArrowRight,
} from "lucide-react";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "Get help with GoPasal. Contact our team, browse common help topics, and learn how to resolve order issues — contact the shop first, then escalate to us.",
};

const TOPICS = [
  {
    icon: Truck,
    title: "Delivery",
    body: "How delivery works, timing, coverage areas and fees.",
    href: "/legal/delivery",
  },
  {
    icon: RotateCcw,
    title: "Returns & refunds",
    body: "Damaged, wrong or missing items, and how refunds work.",
    href: "/legal/refund",
  },
  {
    icon: HelpCircle,
    title: "How GoPasal works",
    body: "From finding a shop to paying at your door.",
    href: "/how-it-works",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & data",
    body: "What we collect and how your phone number is protected.",
    href: "/legal/privacy",
  },
  {
    icon: FileText,
    title: "Terms of Service",
    body: "The terms that govern your use of GoPasal.",
    href: "/legal/terms",
  },
  {
    icon: MessageCircle,
    title: "Contact us",
    body: "Reach our team by email, phone or the contact form.",
    href: "/contact",
  },
];

export default function SupportPage() {
  return (
    <div className="pb-20">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge tone="crimson">
              <HelpCircle className="h-3.5 w-3.5" /> Help centre
            </Badge>
            <h1 className="mt-5 text-4xl font-extrabold text-ink-900 md:text-6xl">
              How can we help?
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
              Find quick answers below, or reach our team directly. For an issue with a specific
              order, please contact the shop first — then escalate to us if you need to.
            </p>
          </div>
        </Container>
      </header>

      {/* Contact channels */}
      <section className="py-12 md:py-16">
        <Container>
          <div className="grid gap-5 sm:grid-cols-2">
            <Reveal>
              <a
                href="mailto:hello@gopasal.com"
                className="gp-card flex items-center gap-4 p-6"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                  <Mail className="h-6 w-6" />
                </span>
                <span>
                  <span className="block text-sm text-ink-500">Email us</span>
                  <span className="block text-lg font-bold text-ink-900">hello@gopasal.com</span>
                </span>
              </a>
            </Reveal>
            <Reveal delay={1}>
              <a href="tel:+97716000000" className="gp-card flex items-center gap-4 p-6">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                  <Phone className="h-6 w-6" />
                </span>
                <span>
                  <span className="block text-sm text-ink-500">Call us</span>
                  <span className="block text-lg font-bold text-ink-900">+977 1 6000000</span>
                </span>
              </a>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Order-issue note */}
      <section className="pb-12">
        <Container>
          <Reveal>
            <div className="flex items-start gap-4 rounded-2xl border border-crimson-100 bg-crimson-50 p-6">
              <MessageCircle className="mt-0.5 h-6 w-6 shrink-0 text-crimson-600" />
              <div>
                <h2 className="text-lg font-bold text-ink-900">Have an issue with an order?</h2>
                <p className="mt-1.5 leading-relaxed text-ink-700">
                  Since shops fulfil and deliver your orders, the fastest way to fix an order problem
                  is to contact the shop directly through the app. If you and the shop can&rsquo;t
                  resolve it, escalate to GoPasal support and we&rsquo;ll mediate a fair outcome.
                </p>
                <Button href="/legal/refund" variant="outline" size="sm" className="mt-4">
                  Read the Return &amp; Refund Policy <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Help topics */}
      <section>
        <Container>
          <Reveal>
            <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">Common help topics</h2>
          </Reveal>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((topic, i) => (
              <Reveal key={topic.title} delay={i}>
                <Link href={topic.href} className="gp-card group block h-full p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <topic.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 flex items-center gap-1 text-lg font-bold text-ink-900">
                    {topic.title}
                    <ArrowRight className="h-4 w-4 text-crimson-500 transition-transform group-hover:translate-x-1" />
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{topic.body}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
