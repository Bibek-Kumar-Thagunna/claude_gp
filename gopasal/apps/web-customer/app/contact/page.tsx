import type { Metadata } from "next";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Contact GoPasal",
  description:
    "Get in touch with GoPasal — email, phone, or send us a message. Based in Kathmandu, Nepal. Operated by Velayon Dynamics Pvt. Ltd.",
};

function Field({
  label,
  name,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-700">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
      />
    </label>
  );
}

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
                <a href="tel:+97716000000" className="gp-card flex items-start gap-4 p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">Phone</h2>
                    <p className="mt-1 text-sm text-ink-600">+977 1 6000000</p>
                  </div>
                </a>
                <div className="gp-card flex items-start gap-4 p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">Support hours</h2>
                    <p className="mt-1 text-sm text-ink-600">Sunday – Friday, 9:00 AM – 6:00 PM NPT</p>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Form */}
            <Reveal delay={1}>
              <div className="rounded-3xl border border-ink-100 bg-white p-6 md:p-8">
                <h2 className="text-xl font-bold text-ink-900">Send us a message</h2>
                <p className="mt-1 text-sm text-ink-500">
                  We usually reply within one business day.
                </p>
                <form className="mt-6 space-y-4" action="#" method="post">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name" name="name" placeholder="Sita Sharma" />
                    <Field
                      label="Email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <Field label="Subject" name="subject" placeholder="How can we help?" />
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-ink-700">Message</span>
                    <textarea
                      name="message"
                      rows={5}
                      placeholder="Tell us a bit more…"
                      className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
                    />
                  </label>
                  <Button type="submit" className="w-full">
                    Send message
                  </Button>
                  <p className="text-center text-xs text-ink-400">
                    By sending, you agree to our{" "}
                    <a href="/legal/privacy" className="font-medium text-crimson-600 hover:underline">
                      Privacy Policy
                    </a>
                    .
                  </p>
                </form>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>
    </div>
  );
}
