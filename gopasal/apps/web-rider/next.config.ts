import type { NextConfig } from "next";
import { secureNextConfig } from "../next-security";

const nextConfig: NextConfig = secureNextConfig({
  reactStrictMode: true,
  transpilePackages: ["@gopasal/tokens", "@gopasal/ui"],
  experimental: { optimizePackageImports: ["lucide-react"] },
});

export default nextConfig;
