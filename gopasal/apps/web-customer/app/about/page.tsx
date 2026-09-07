import type { Metadata } from "next";
import { Store, Users, HeartHandshake, MapPin, Sparkles, ShieldCheck } from "lucide-react";
import { Logo } from "@gopasal/ui";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "About GoPasal",
  description:
    "GoPasal empowers Nepal's neighbourhood shops to reach nearby customers online — keeping commerce local, personal and trustworthy. Built by Velayon Dynamics Pvt. Ltd.",
};

const VALUES = [
  {
    icon: Store,
    title: "Shops first",
    body: "We build for the kirana, the pharmacy, the vegetable seller — the shops that hold a neighbourhood together.",
  },
  {
    icon: HeartHandshake,
    title: "Trust over speed",
    body: "We connect you with shops you can talk to directly. No anonymous fleet, no empty promises — just people you know.",
  },
  {
    icon: MapPin,
    title: "Truly local",
    body: "Each shop serves its own area, on its own terms. Commerce stays in the neighbourhood, where it belongs.",
  },
  {
    icon: ShieldCheck,
    title: "Fair & transparent",
    body: "Clear pricing, verified sellers, and honest mediation when something goes wrong.",
  },
];

const FOUNDERS = [
  {
    name: "Bibek Kumar Thagunna",
    role: "Founder",
    initials: "BT",
    tone: "from-crimson-500 to-crimson-700",
  },
  {
    name: "Suyogya Sedhai",
    role: "Co-founder",
    initials: "SS",
    tone: "from-[#F6A609] to-[#D98B00]",
  },
];

export default function AboutPage() {
  return (
    <div className="pb-20">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge tone="crimson">
              <Sparkles className="h-3.5 w-3.5" /> Our story
            </Badge>
            <h1 className="mt-5 text-4xl font-extrabold text-ink-900 md:text-6xl">
              Empowering Nepal&rsquo;s neighbourhood shops.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
              GoPasal brings the shops you already know and trust online — so you can order from your
              local kirana, pharmacy or vegetable seller in a few taps, and still buy from a real
              person down the road.
            </p>
          </div>
        </Container>
      </header>
      {/* Mission */}
      <section className="py-14 md:py-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <div>
                <h2 className="text-3xl font-bold text-ink-900 md:text-4xl">Why we exist</h2>
                <p className="mt-4 leading-relaxed text-ink-600">
                  Nepal&rsquo;s neighbourhoods run on small shops — the pasal on the corner, the
                  pharmacy that knows your family, the vegetable stall with the freshest produce. As
                  shopping moved online, these shops risked being left behind, competing against
                  faceless warehouses far away.
                </p>
                <p className="mt-4 leading-relaxed text-ink-600">
                  We think that is the wrong trade. GoPasal gives every neighbourhood shop the tools
                  to reach nearby customers online — a catalogue, orders, staff, and self-managed
                  delivery — without losing the personal relationship that makes them special. You
                  get the convenience of ordering from your phone, and you still buy from a real
                  shopkeeper you can call by name.
                </p>
              </div>
            </Reveal>
            <Reveal delay={1}>
              <div className="grid grid-cols-2 gap-4">
                {VALUES.map((v) => (
                  <div key={v.title} className="gp-card h-full p-5">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                      <v.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 text-base font-bold text-ink-900">{v.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{v.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Founders */}
      <section className="bg-white py-14 md:py-20">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Badge tone="marigold">
                <Users className="h-3.5 w-3.5" /> The team
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-ink-900 md:text-4xl">
                Founded to keep commerce local
              </h2>
              <p className="mt-3 text-ink-600">
                GoPasal was started by people who grew up shopping at Nepal&rsquo;s neighbourhood
                pasals — and wanted to give those shops a fair shot in a digital world.
              </p>
            </div>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-2xl gap-6 sm:grid-cols-2">
            {FOUNDERS.map((f, i) => (
              <Reveal key={f.name} delay={i}>
                <div className="gp-card flex h-full flex-col items-center p-8 text-center">
                  <span
                    className={`inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${f.tone} text-2xl font-extrabold text-white`}
                  >
                    {f.initials}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink-900">{f.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-crimson-600">{f.role}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Built by Velayon Dynamics */}
      <section className="py-14 md:py-20">
        <Container>
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-ink-100 bg-paper p-8 md:p-12">
              <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-40" />
              <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-crimson-600">
                    Engineered &amp; designed by
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-ink-900 md:text-3xl">
                    Velayon Dynamics Pvt. Ltd.
                  </h2>
                  <p className="mt-3 leading-relaxed text-ink-600">
                    GoPasal is built and operated by Velayon Dynamics Pvt. Ltd., a Nepal-registered
                    technology company owned by Bibek Kumar Thagunna. The marketplace operates as
                    &ldquo;GoPasal, operated by Velayon Dynamics Pvt. Ltd., registered in
                    Nepal.&rdquo;
                  </p>
                </div>
                <div className="shrink-0">
                  <Logo variant="mark" height={72} />
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* CTA */}
      <section className="pb-4">
        <Container>
          <Reveal>
            <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-gradient-to-br from-crimson-500 to-crimson-700 p-10 text-center text-white shadow-crimson md:p-14">
              <div className="gp-dot-grid absolute inset-0 opacity-20" />
              <div className="relative">
                <h2 className="text-3xl font-bold text-white md:text-4xl">
                  Shop local. Support your neighbourhood.
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-white/85">
                  Discover verified shops near you, or bring your own shop online with GoPasal.
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <Button href="/shops" variant="outline" className="bg-white text-crimson-700">
                    Browse shops
                  </Button>
                  <Button href="/sell" variant="ghost" className="text-white hover:bg-white/10">
                    Sell on GoPasal
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
