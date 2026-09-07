import type { Metadata } from "next";
import {
  Search,
  ShoppingCart,
  MessageCircle,
  PackageCheck,
  MapPin,
  Wallet,
} from "lucide-react";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "How GoPasal works",
  description:
    "Find a neighbourhood shop, order what you need, talk to the shopkeeper, and pay on delivery. Here is how ordering on GoPasal works — start to finish.",
};

const STEPS = [
  {
    icon: Search,
    title: "Find a shop near you",
    body: "Set your location and browse verified neighbourhood shops that serve your area — kirana, pharmacy, vegetables, bakery and more. Each shop shows its hours, ratings and delivery area.",
  },
  {
    icon: ShoppingCart,
    title: "Order what you need",
    body: "Add items to your cart from a single shop and place your order. You'll see any minimum order value and delivery fee up front. Cash on delivery is available on most orders.",
  },
  {
    icon: MessageCircle,
    title: "Talk to the shopkeeper",
    body: "Message or call the shop owner or their staff directly to share directions, add a landmark, or agree a convenient time. Your phone number stays protected — contact is routed through GoPasal.",
  },
  {
    icon: PackageCheck,
    title: "Receive & pay",
    body: "The shop delivers within its own area, on its own schedule. Check your items at the door, and pay the shop directly with cash on delivery. Simple and transparent.",
  },
];

const FAQ = [
  {
    q: "How fast will my order arrive?",
    a: "Delivery is done by each shop, within its own area and on its own schedule — so timing is set by the shop, not by GoPasal. We don't promise a fixed delivery time. If timing matters, message the shop to agree a convenient window before or after ordering.",
  },
  {
    q: "Who actually delivers my order?",
    a: "The shop you order from delivers it, using the owner or their own staff. GoPasal does not run a delivery fleet. This is what keeps GoPasal local — you're served by a neighbourhood shop you can talk to directly.",
  },
  {
    q: "How do I pay?",
    a: "Cash on delivery is available on most orders — you pay the shop in Nepali Rupees when your order is handed over. Online payment options such as eSewa and Khalti may be offered as they become available.",
  },
  {
    q: "Is there a delivery fee?",
    a: "Delivery fees are set by each shop and shown before you confirm. Some shops offer free delivery above a minimum order value; others charge a small flat fee. Any minimum order value appears on the shop's page.",
  },
  {
    q: "What if something is wrong with my order?",
    a: "Contact the shop first — for cash on delivery you can decline a damaged or wrong item at the door and pay only for what you accept. If you and the shop can't resolve it, GoPasal steps in to mediate. See our Return & Refund Policy for details.",
  },
  {
    q: "Which areas does GoPasal serve?",
    a: "Each shop sets the area it can serve, and coverage grows as more shops join across the Kathmandu valley and beyond. Set your location to see the shops that deliver to your neighbourhood.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="pb-20">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge tone="crimson">
              <MapPin className="h-3.5 w-3.5" /> For customers
            </Badge>
            <h1 className="mt-5 text-4xl font-extrabold text-ink-900 md:text-6xl">
              How GoPasal works
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
              Order from the shops you already trust, and still buy from a real person nearby. Here is
              everything you need to know — from finding a shop to paying at your door.
            </p>
          </div>
        </Container>
      </header>
      {/* Steps */}
      <section className="py-14 md:py-20">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i}>
                <div className="relative h-full rounded-2xl border border-ink-100 bg-white p-6">
                  <span className="absolute right-5 top-5 font-display text-4xl font-extrabold text-crimson-100">
                    {i + 1}
                  </span>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <s.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* No fast-delivery framing */}
      <section className="pb-14 md:pb-20">
        <Container>
          <Reveal>
            <div className="grid gap-4 rounded-3xl border border-ink-100 bg-paper p-6 sm:grid-cols-3 md:p-8">
              {[
                {
                  icon: MapPin,
                  ttl: "Delivered by the shop",
                  body: "Each shop delivers in its own area, on its own schedule — no fixed platform time.",
                },
                {
                  icon: MessageCircle,
                  ttl: "Talk to the shopkeeper",
                  body: "Reach the owner or their staff directly. Your number stays protected.",
                },
                {
                  icon: Wallet,
                  ttl: "Pay on delivery",
                  body: "Cash on delivery in Nepali Rupees — pay only for what you accept at the door.",
                },
              ].map((f) => (
                <div key={f.ttl} className="flex gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-600">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-ink-900">{f.ttl}</h3>
                    <p className="mt-1 text-sm text-ink-600">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      {/* FAQ */}
      <section className="pb-8">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-3xl">
              <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">Frequently asked</h2>
              <div className="mt-6 space-y-3">
                {FAQ.map((item) => (
                  <details
                    key={item.q}
                    className="group rounded-2xl border border-ink-100 bg-white p-5 open:shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                      {item.q}
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-crimson-50 text-crimson-600 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 leading-relaxed text-ink-600">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* CTA */}
      <section>
        <Container>
          <Reveal>
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-ink-100 bg-white p-10 text-center">
              <h2 className="text-2xl font-bold text-ink-900 md:text-3xl">Ready to shop local?</h2>
              <p className="max-w-md text-ink-600">
                Find verified neighbourhood shops that deliver to your area.
              </p>
              <Button href="/shops" size="lg">
                Browse shops near you
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
