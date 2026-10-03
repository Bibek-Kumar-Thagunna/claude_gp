import type { Metadata } from "next";
import { Mail, MapPin, LifeBuoy } from "lucide-react";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Contact GoPasal",
  description:
    "Get in touch with GoPasal — email, phone, or send us a message. Based in Kathmandu, Nepal. Operated by Velayon Dynamics Pvt. Ltd.",
};

export default function ContactPage() {
  return (
    <div className="pb-20">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-ink-100 bg-crimson-glow">
        <div className="gp-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <Container className="relative py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge tone="crimson">
              <Mail className="h-3.5 w-3.5" /> Get in touch
            </Badge>
            <h1 className="mt-5 text-4xl font-extrabold text-ink-900 md:text-6xl">Contact us</h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
              Questions, feedback or partnership ideas? We&rsquo;d love to hear from you. For an issue
              with a specific order, please contact the shop first, then escalate to us if needed.
            </p>
          </div>
        </Container>
      </header>

      <section className="py-14 md:py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            {/* Details */}
            <Reveal>
              <div className="space-y-5">
                <div className="gp-card flex items-start gap-4 p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">Address</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">
                      GoPasal, operated by Velayon Dynamics Pvt. Ltd.
                      <br />
                      Kathmandu, Nepal
                    </p>
                  </div>
                </div>
                <a href="mailto:hello@gopasal.com" className="gp-card flex items-start gap-4 p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">Email</h2>
                    <p className="mt-1 text-sm text-ink-600">hello@gopasal.com</p>
                  </div>
                </a>
                <div className="gp-card flex items-start gap-4 p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <LifeBuoy className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">In-app support</h2>
                    <p className="mt-1 text-sm text-ink-600">Open a persisted ticket and follow staff replies.</p>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Form */}
            <Reveal delay={1}>
              <div className="rounded-3xl border border-ink-100 bg-white p-6 md:p-8">
                <h2 className="text-xl font-bold text-ink-900">Open a support ticket</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Sign in to send a request through GoPasal. The API persists the ticket and staff replies are visible from the same help centre.
                </p>
                <Button href="/support" className="mt-6 w-full">Go to support</Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>
    </div>
  );
}
