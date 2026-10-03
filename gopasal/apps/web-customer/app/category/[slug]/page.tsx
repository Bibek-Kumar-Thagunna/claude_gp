import type { Metadata } from "next";
import { ShopsExplorer } from "@/components/shops/ShopsExplorer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ShopsExplorer initialCategory={slug} />;
}
