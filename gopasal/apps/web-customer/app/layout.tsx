import type { Metadata, Viewport } from "next";
import "./globals.css";
import {
  AuthProvider,
  LanguageProvider,
  CartProvider,
  SavedProvider,
} from "@/components/providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Splash } from "@/components/Splash";
import { OfflineWatcher } from "@/components/OfflineWatcher";
import { FloatingCart } from "@/components/cart/FloatingCart";
import { LocationProvider } from "@/components/location/LocationProvider";
import { LocationPicker } from "@/components/location/LocationPicker";
import { ReferralCapture } from "@/components/rewards/ReferralCapture";
import "maplibre-gl/dist/maplibre-gl.css";

const SITE = "https://gopasal.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "GoPasal — Your neighbourhood shops, online",
    template: "%s · GoPasal",
  },
  description:
    "GoPasal connects you with trusted local shops across Nepal — kirana, pharmacy, fresh vegetables and more. Order online, talk to the shopkeeper, and pay on delivery.",
  applicationName: "GoPasal",
  keywords: [
    "GoPasal",
    "Nepal",
    "kirana",
    "online shopping Nepal",
    "local shops",
    "hyperlocal",
    "cash on delivery",
  ],
  authors: [{ name: "Velayon Dynamics Pvt. Ltd." }],
  creator: "Velayon Dynamics Pvt. Ltd.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_NP",
    url: SITE,
    siteName: "GoPasal",
    title: "GoPasal — Your neighbourhood shops, online",
    description:
      "Discover trusted local shops near you across Nepal. Order online, connect with the shopkeeper, pay on delivery.",
  },
  twitter: {
    card: "summary_large_image",
    title: "GoPasal",
    description: "Your neighbourhood shops, online.",
  },
};

export const viewport: Viewport = {
  themeColor: "#E11945",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: some browser extensions (e.g. Bitdefender
    // TrafficLight) inject attributes like `bis_skin_checked` / `__processed_*`
    // onto <html>/<body> before React hydrates. That is not an app bug, but it
    // trips React's hydration check — suppress the (one-level-deep) warning here.
    <html lang="en" suppressHydrationWarning className="font-system">
      <body suppressHydrationWarning className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[110] focus:rounded-lg focus:bg-crimson-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <LanguageProvider>
          <AuthProvider>
            <LocationProvider>
              <SavedProvider>
                <CartProvider>
                  <Splash />
                  <Header />
                  <main id="main">{children}</main>
                  <Footer />
                  <FloatingCart />
                  <LocationPicker />
                  <ReferralCapture />
                  <OfflineWatcher />
                </CartProvider>
              </SavedProvider>
            </LocationProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
