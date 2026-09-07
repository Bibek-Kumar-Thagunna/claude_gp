import type { Metadata } from "next";
import { ShopsExplorer } from "@/components/shops/ShopsExplorer";

export const metadata: Metadata = {
  title: "Shops near you",
  description: "Browse verified local shops across Nepal on GoPasal.",
};

export default function ShopsPage() {
  return <ShopsExplorer />;
}
