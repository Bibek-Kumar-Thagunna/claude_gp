import type { Metadata } from "next";
import Link from "next/link";
import {
  Store,
  Users,
  Boxes,
  ClipboardList,
  Truck,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Sell on GoPasal",
  description:
    "Bring your shop online with GoPasal. Reach neighbourhood customers, manage your catalogue, orders and staff, deliver on your own terms, and see analytics across every shop you own.",
};

const SELLER_URL = "https://seller.gopasal.com";

const BENEFITS = [
  {
    icon: Users,
    title: "Reach neighbourhood customers",
    body: "Get discovered by shoppers right around you — the people most likely to become regulars — without leaving your counter.",
  },
  {
    icon: Boxes,
    title: "Manage your catalogue",
    body: "Add products, prices and photos in minutes. Update stock and offers any time, from your phone or a computer.",
  },
  {
    icon: ClipboardList,
    title: "Handle orders with ease",
    body: "Accept, prepare and track orders in one dashboard. Message customers directly when you need to confirm a detail.",
  },
  {
    icon: Truck,
    title: "Deliver on your own terms",
    body: "You set your coverage area, your schedule and your delivery fee. GoPasal never dictates a delivery time — you stay in control.",
  },
  {
    icon: BarChart3,
    title: "Per-shop & combined analytics",
    body: "Own more than one shop? See each shop on its own, or a combined view across all of them — sales, top products and trends.",
  },
  {
    icon: ShieldCheck,
    title: "Custom staff roles",
    body: "Add your team and give each person exactly the access they need — catalogue, orders, or deliveries — with custom roles.",
  },
];

const STEPS = [
  "Register your shop and get verified",
  "Add your products, prices and delivery area",
  "Start receiving orders from nearby customers",
];

export default function SellPage() {
  return (
    <div className="pb-20">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge tone="crimson">
              <Store className="h-3.5 w-3.5" /> For shops
            </Badge>
            <h1 className="mt-5 text-4xl font-extrabold text-ink-900 md:text-6xl">
              Bring your shop online. Sell on GoPasal.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
              List your products, manage orders and your own staff, and deliver to your neighbourhood
              — all from one dashboard. Keep the personal relationship with your customers, and add
              the convenience of online orders.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href={SELLER_URL} size="lg">
                Start selling <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="#pricing" variant="outline" size="lg">
                See pricing
              </Button>
            </div>
          </div>
        </Container>
      </header>
      {/* Benefits */}
      <section className="py-14 md:py-20">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">
                Everything you need to run your shop online
              </h2>
              <p className="mt-3 text-ink-600">
                Built for Nepal&rsquo;s neighbourhood shops — from a single kirana to owners running
                several shops at once.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i}>
                <div className="gp-card h-full p-6">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <b.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink-900">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{b.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* How to start */}
      <section className="bg-white py-14 md:py-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <div>
                <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">
                  Up and running in three steps
                </h2>
                <ul className="mt-6 space-y-4">
                  {STEPS.map((s, i) => (
                    <li key={s} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-crimson-500 text-sm font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="text-ink-700">{s}</span>
                    </li>
                  ))}
                </ul>
                <Button href={SELLER_URL} className="mt-8">
                  Go to the seller dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Reveal>
            <Reveal delay={1}>
              <div className="rounded-3xl border border-ink-100 bg-paper p-8">
                <p className="text-sm font-semibold text-crimson-600">Why shops choose GoPasal</p>
                <ul className="mt-4 space-y-3">
                  {[
                    "You keep control of pricing, coverage and delivery",
                    "Talk to your customers directly, number protected",
                    "Add staff with custom roles and permissions",
                    "One combined view across all the shops you own",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-ink-700">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0E9F6E]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" className="scroll-mt-24 py-14 md:py-20">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Badge tone="marigold">Pricing</Badge>
              <h2 className="mt-4 text-3xl font-bold text-ink-900 md:text-4xl">
                Simple, shop-friendly pricing
              </h2>
              <p className="mt-3 text-ink-600">
                Get started at no upfront cost. Detailed plans are shown when you register your shop.
              </p>
            </div>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
            <Reveal>
              <div className="gp-card flex h-full flex-col p-8">
                <h3 className="text-lg font-bold text-ink-900">Starter</h3>
                <p className="mt-1 text-sm text-ink-500">For a single neighbourhood shop</p>
                <p className="mt-6 font-display text-4xl font-extrabold text-ink-900">
                  Rs. 0<span className="text-base font-medium text-ink-500"> to start</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[#0E9F6E]" /> Catalogue &amp; orders
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[#0E9F6E]" /> Self-managed delivery
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[#0E9F6E]" /> Direct customer chat
                  </li>
                </ul>
                <Button href={SELLER_URL} variant="outline" className="mt-8">
                  Register your shop
                </Button>
              </div>
            </Reveal>
            <Reveal delay={1}>
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-crimson-500 to-crimson-700 p-8 text-white shadow-crimson">
                <div className="gp-dot-grid absolute inset-0 opacity-20" />
                <div className="relative flex flex-1 flex-col">
                  <h3 className="text-lg font-bold text-white">Multi-shop</h3>
                  <p className="mt-1 text-sm text-white/80">For owners running several shops</p>
                  <p className="mt-6 font-display text-4xl font-extrabold text-white">
                    Let&rsquo;s talk
                  </p>
                  <ul className="mt-6 space-y-2.5 text-sm text-white/90">
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0" /> Everything in Starter
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0" /> Combined analytics across shops
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0" /> Custom staff roles per shop
                    </li>
                  </ul>
                  <Button
                    href={SELLER_URL}
                    variant="outline"
                    className="mt-8 bg-white text-crimson-700"
                  >
                    Get started
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section>
        <Container>
          <Reveal>
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-ink-100 bg-white p-10 text-center md:p-14">
              <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">
                Your shop, online in minutes
              </h2>
              <p className="max-w-md text-ink-600">
                Join the neighbourhood shops already growing with GoPasal.
              </p>
              <Link href={SELLER_URL} className="gp-btn gp-btn-primary px-7 py-3.5 text-base md:text-lg">
                Start selling on GoPasal <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
