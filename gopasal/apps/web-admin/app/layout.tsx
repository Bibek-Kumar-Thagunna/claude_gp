import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter, Hind } from "next/font/google";
import "./globals.css";
import { AdminProvider } from "@/components/providers";
import { AuthProvider } from "@/components/auth-provider";
import { Splash } from "@/components/Splash";
import { OfflineWatcher } from "@/components/OfflineWatcher";

const display = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const deva = Hind({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GoPasal Admin",
    template: "%s · GoPasal Admin",
  },
  description:
    "GoPasal platform console — shop approvals, moderation, disputes, fraud, policy, analytics and the compliance audit trail.",
  metadataBase: new URL("https://admin.gopasal.com"),
  applicationName: "GoPasal Admin",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false }, // internal, authenticated console
};

export const viewport: Viewport = {
  themeColor: "#E11945",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${deva.variable}`}>
      <body>
        <Splash />
        {/* AuthProvider is outside AdminProvider because AdminProvider's `can`
            now delegates to it: real permissions from `GET /auth/me` decide what
            the console offers, not a local role fixture. */}
        <AuthProvider>
          <AdminProvider>{children}</AdminProvider>
        </AuthProvider>
        <OfflineWatcher />
      </body>
    </html>
  );
}
