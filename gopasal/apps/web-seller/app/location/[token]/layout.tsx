import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confirm shop location",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function LocationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
