import type { Metadata } from "next";
import { StoreScreen } from "@/components/store/StoreScreen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "), robots: { index: false } };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StoreScreen slug={slug} />;
}
