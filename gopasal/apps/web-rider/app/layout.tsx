import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://rider.gopasal.com"),
  title: { default: "GoPasal Rider", template: "%s · GoPasal Rider" },
  description: "GoPasal delivery operations for registered riders.",
  applicationName: "GoPasal Rider",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#E11945",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
          Skip to deliveries
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
