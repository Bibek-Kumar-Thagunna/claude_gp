import type { NextConfig } from "next";
import { secureNextConfig } from "../next-security";

const nextConfig: NextConfig = secureNextConfig({
  reactStrictMode: true,
  // Compile the workspace design-token + ui packages from source.
  transpilePackages: ["@gopasal/tokens", "@gopasal/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: { formats: ["image/avif", "image/webp"] },
});

export default nextConfig;
