import type { MetadataRoute } from "next";
import { STORES, CATEGORIES } from "@/lib/data";

const BASE = "https://gopasal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    "",
    "/shops",
    "/about",
    "/how-it-works",
    "/sell",
    "/get-app",
    "/support",
    "/contact",
    "/blog",
    "/careers",
    "/legal/terms",
    "/legal/privacy",
    "/legal/refund",
    "/legal/delivery",
    "/legal/cookies",
  ].map((path) => ({ url: `${BASE}${path}`, lastModified: now }));

  const stores = STORES.map((s) => ({ url: `${BASE}/store/${s.slug}`, lastModified: now }));
  const cats = CATEGORIES.map((c) => ({ url: `${BASE}/category/${c.slug}`, lastModified: now }));

  return [...routes, ...cats, ...stores];
}
