import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/cart", "/orders"] },
    sitemap: "https://gopasal.com/sitemap.xml",
  };
}
