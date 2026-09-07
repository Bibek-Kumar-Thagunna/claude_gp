import type { Metadata } from "next";
import { Container, Button } from "@/components/primitives";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the team building Nepal’s neighbourhood commerce platform.",
};

export default function CareersPage() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-crimson-50 text-crimson-600">
          <Sparkles className="h-7 w-7" />
        </span>
        <h1 className="mt-6 text-4xl font-bold text-ink-900">Build the future of local commerce</h1>
        <p className="mt-4 text-lg text-ink-600">
          We’re a small, ambitious team in Kathmandu on a mission to bring every neighbourhood shop
          in Nepal online. We don’t have open roles listed right now — but we’re always glad to meet
          people who care about local businesses.
        </p>
        <p className="mt-4 text-ink-600">
          Send us a note at{" "}
          <a href="mailto:careers@gopasal.com" className="font-semibold text-crimson-600 hover:underline">
            careers@gopasal.com
          </a>
          .
        </p>
        <div className="mt-8">
          <Button href="/about">Learn about us</Button>
        </div>
        <p className="mt-10 text-sm text-ink-400">
          GoPasal is operated by Velayon Dynamics Pvt. Ltd., Kathmandu, Nepal.
        </p>
      </div>
    </Container>
  );
}
