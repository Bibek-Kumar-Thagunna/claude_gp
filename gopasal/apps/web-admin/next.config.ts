import type { NextConfig } from "next";
import { secureNextConfig } from "../next-security";

const nextConfig: NextConfig = secureNextConfig({
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not a build output, so Next has to
  // compile them itself.
  transpilePackages: ["@gopasal/api-client", "@gopasal/tokens", "@gopasal/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: { formats: ["image/avif", "image/webp"] },
});

export default nextConfig;
