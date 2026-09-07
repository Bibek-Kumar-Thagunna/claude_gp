import type { Metadata } from "next";
import { Container, Button, Badge } from "@/components/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Blog",
  description: "Stories, tips and updates from GoPasal and Nepal’s neighbourhood shops.",
};

const POSTS = [
  {
    tag: "Guide",
    title: "How to get the most from your neighbourhood kirana",
    excerpt: "Ordering local isn’t just convenient — it keeps money in your community. Here’s how to shop smart on GoPasal.",
    date: "Coming soon",
  },
  {
    tag: "Sellers",
    title: "5 ways small shops can grow with online orders",
    excerpt: "From listing your first products to managing staff and self-delivery, a practical playbook for shopkeepers.",
    date: "Coming soon",
  },
  {
    tag: "Product",
    title: "Why we don’t promise delivery times (and why that’s better)",
    excerpt: "Every shop is different. We connect you directly with the shopkeeper so expectations are honest and local.",
    date: "Coming soon",
  },
];

export default function BlogPage() {
  return (
    <Container className="py-16">
      <Reveal>
        <h1 className="text-4xl font-bold text-ink-900">The GoPasal Blog</h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Stories, guides and updates for customers and shopkeepers. We’re just getting started —
          check back soon.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {POSTS.map((p, i) => (
          <Reveal key={p.title} delay={i}>
            <article className="gp-card flex h-full flex-col p-6">
              <Badge tone="crimson">{p.tag}</Badge>
              <h2 className="mt-3 text-xl font-bold text-ink-900">{p.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{p.excerpt}</p>
              <p className="mt-4 text-xs font-medium text-ink-400">{p.date}</p>
            </article>
          </Reveal>
        ))}
      </div>

      <div className="mt-12">
        <Button href="/shops" variant="outline">Start shopping</Button>
      </div>
    </Container>
  );
}
