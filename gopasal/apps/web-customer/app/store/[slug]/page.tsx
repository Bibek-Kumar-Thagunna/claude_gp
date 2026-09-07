import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { STORES, storeBySlug } from "@/lib/data";
import { StoreView } from "@/components/store/StoreView";

export function generateStaticParams() {
  return STORES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = storeBySlug(slug);
  if (!store) return { title: "Shop not found" };
  return {
    title: store.name,
    description: `Order from ${store.name} in ${store.area}. ${store.products.length} products · Cash on delivery · Delivered by the shop.`,
  };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = storeBySlug(slug);
  if (!store) notFound();
  return <StoreView store={store} />;
}
