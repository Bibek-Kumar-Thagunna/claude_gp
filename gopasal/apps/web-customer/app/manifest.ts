import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoPasal — Your neighbourhood shops",
    short_name: "GoPasal",
    description:
      "Order from trusted local shops across Nepal. Talk to the shopkeeper and pay on delivery.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F5",
    theme_color: "#E11945",
    lang: "en",
    categories: ["shopping", "food", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
