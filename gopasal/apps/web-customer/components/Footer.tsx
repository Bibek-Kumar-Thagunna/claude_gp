"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "@gopasal/ui";
import { Facebook, Instagram, Youtube, Mail, Phone } from "lucide-react";
import { useLang } from "@/components/providers";
import { t } from "@/lib/i18n";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "For customers",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Browse shops", href: "/shops" },
      { label: "Get the app", href: "/get-app" },
      { label: "Help & support", href: "/support" },
    ],
  },
  {
    title: "For shops",
    links: [
      { label: "Sell on GoPasal", href: "/sell" },
      { label: "Seller centre", href: "https://seller.gopasal.com" },
      { label: "Pricing", href: "/sell#pricing" },
      { label: "Merchant support", href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Return & Refund", href: "/legal/refund" },
      { label: "Delivery Policy", href: "/legal/delivery" },
    ],
  },
];

export function Footer() {
  const { lang } = useLang();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-ink-200 bg-white">
      <div className="gp-container py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo variant="full" height={32} />
            <p className="mt-4 text-sm leading-relaxed text-ink-600">
              {t("brandTagline", lang)}
            </p>
            <div className="mt-5 flex gap-2">
              {[Facebook, Instagram, Youtube].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="social"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition hover:border-crimson-300 hover:text-crimson-600"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
            <div className="mt-5 space-y-1.5 text-sm text-ink-600">
              <a href="tel:+97716000000" className="flex items-center gap-2 hover:text-crimson-600">
                <Phone className="h-4 w-4" /> +977 1 6000000
              </a>
              <a href="mailto:hello@gopasal.com" className="flex items-center gap-2 hover:text-crimson-600">
                <Mail className="h-4 w-4" /> hello@gopasal.com
              </a>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-bold text-ink-900">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-ink-600 transition hover:text-crimson-600">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-ink-100 pt-6 text-sm text-ink-500 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} GoPasal. {t("footerRights", lang)}
          </p>
          <p className="leading-relaxed">
            Founded by <span className="font-semibold text-ink-700">Bibek Kumar Thagunna</span> &amp;{" "}
            <span className="font-semibold text-ink-700">Suyogya Sedhai</span>. Engineered &amp; designed by{" "}
            <a
              href="#"
              className="font-semibold text-crimson-600 hover:underline"
            >
              Velayon Dynamics Pvt. Ltd.
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
