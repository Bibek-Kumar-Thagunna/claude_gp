import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoPasal Rider",
    short_name: "GP Rider",
    description: "Secure pickup, delivery, location and cash collection for GoPasal riders.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f4",
    theme_color: "#E11945",
    lang: "en",
    categories: ["business", "navigation", "productivity"],
  };
}
