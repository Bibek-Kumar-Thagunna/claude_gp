import type { Metadata } from "next";
import { SavedView } from "@/components/saved/SavedView";

export const metadata: Metadata = {
  title: "Saved shops and products",
  description: "Return to the neighbourhood shops and products you saved on GoPasal.",
};

export default function SavedPage() {
  return <SavedView />;
}
