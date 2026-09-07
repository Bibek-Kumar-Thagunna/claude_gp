import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoPasal Seller — Run your shop",
    short_name: "GoPasal Seller",
    description:
      "Manage orders, catalog, self-delivery, staff and analytics across all your shops on GoPasal.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f5f4",
    theme_color: "#E11945",
    lang: "en",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
