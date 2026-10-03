import type { MetadataRoute } from "next";

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

  return routes;
}
