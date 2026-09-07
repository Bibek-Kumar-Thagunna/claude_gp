import type { Metadata } from "next";
import {
  Smartphone,
  Search,
  MessageCircle,
  Bell,
  Wallet,
  MapPin,
  Store as StoreIcon,
} from "lucide-react";
import { Container, Badge } from "@/components/primitives";
import { Logo } from "@gopasal/ui";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Get the GoPasal app",
  description:
    "Order from neighbourhood shops, chat with shopkeepers, and pay on delivery — download the GoPasal app for Android and iOS.",
};

const FEATURES = [
  { icon: Search, title: "Discover shops nearby", body: "Find verified shops that serve your area." },
  { icon: MessageCircle, title: "Chat with shopkeepers", body: "Coordinate directly — your number stays protected." },
  { icon: Bell, title: "Order updates", body: "Get notified as the shop confirms and delivers." },
  { icon: Wallet, title: "Cash on delivery", body: "Pay the shop when your order arrives." },
];

function StoreBadge({ label, sub }: { label: string; sub: string }) {
  return (
    <a
      href="#"
      aria-label={`${sub} ${label}`}
      className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-2.5 transition hover:border-crimson-300"
    >
      <Smartphone className="h-6 w-6 text-ink-800" />
      <span className="text-left leading-tight">
        <span className="block text-[10px] text-ink-500">{sub}</span>
        <span className="block text-sm font-bold text-ink-900">{label}</span>
      </span>
    </a>
  );
}

export default function GetAppPage() {
  return (
    <div className="pb-20">
      <section className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-16 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <div className="max-w-xl">
                <Badge tone="crimson">
                  <Smartphone className="h-3.5 w-3.5" /> Android &amp; iOS
                </Badge>
                <h1 className="mt-5 text-4xl font-extrabold text-ink-900 md:text-6xl">
                  Get the GoPasal app
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
                  Order faster, track your orders, and chat with shops — all in one place. Buy from
                  the neighbourhood shops you trust, and pay on delivery.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <StoreBadge label="Google Play" sub="Get it on" />
                  <StoreBadge label="App Store" sub="Download on the" />
                </div>
                <p className="mt-3 text-xs text-ink-400">App store links coming soon.</p>
              </div>
            </Reveal>

            {/* Phone mockup */}
            <Reveal delay={1}>
              <div className="flex justify-center">
                <div className="relative h-[460px] w-[230px] rounded-[2.75rem] border-[10px] border-ink-900 bg-white shadow-float">
                  <div className="absolute left-1/2 top-3 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ink-200" />
                  <div className="flex h-full flex-col items-center justify-between px-5 py-12">
                    <div className="flex flex-col items-center">
                      <Logo variant="mark" height={56} />
                      <p className="mt-4 font-display text-xl font-bold text-ink-900">GoPasal</p>
                      <p className="mt-1 text-center text-xs text-ink-500">
                        Your neighbourhood, delivered by the shop.
                      </p>
                    </div>
                    <div className="w-full space-y-2.5">
                      {[
                        { icon: MapPin, label: "Baneshwor, Kathmandu" },
                        { icon: StoreIcon, label: "Namaste Kirana Pasal" },
                        { icon: Wallet, label: "Cash on delivery" },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2.5 text-xs text-ink-700"
                        >
                          <row.icon className="h-4 w-4 text-crimson-500" />
                          <span className="truncate">{row.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Features */}
      <section className="py-14 md:py-20">
        <Container>
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-ink-900 md:text-4xl">
              What you can do
            </h2>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i}>
                <div className="gp-card h-full p-6 text-center">
                  <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <f.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-ink-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
