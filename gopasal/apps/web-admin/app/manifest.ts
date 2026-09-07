import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoPasal Admin — Platform console",
    short_name: "GoPasal Admin",
    description:
      "Shop approvals, catalog moderation, disputes, fraud, policy versioning, analytics and audit for the GoPasal platform.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f5f7",
    theme_color: "#E11945",
    lang: "en",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
