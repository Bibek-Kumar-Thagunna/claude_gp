import type { Metadata, Viewport } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { AuthProvider } from "@/components/auth-provider";
import { ShopProvider } from "@/components/shop-provider";
import { SellerProvider } from "@/components/providers";
import { OfflineWatcher } from "@/components/OfflineWatcher";

export const metadata: Metadata = {
  title: {
    default: "GoPasal Seller",
    template: "%s · GoPasal Seller",
  },
  description:
    "Run your shop on GoPasal — manage orders, catalog, self-delivery, staff and analytics across all your shops.",
  metadataBase: new URL("https://seller.gopasal.com"),
  applicationName: "GoPasal Seller",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false }, // authenticated dashboard
};

export const viewport: Viewport = {
  themeColor: "#E11945",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Provider order is a dependency chain, not a style choice.
            AuthProvider: who is signed in, and what the API says they may do.
            ShopProvider: reads that session to load the seller's real shops.
            SellerProvider: reads the active shop to scope permission checks. */}
        <AuthProvider>
          <ShopProvider>
            <SellerProvider>{children}</SellerProvider>
          </ShopProvider>
        </AuthProvider>
        <OfflineWatcher />
      </body>
    </html>
  );
}
