import type { NextConfig } from "next";

/**
 * Hosts `next/image` is allowed to fetch and optimise.
 *
 * This used to be `[{ protocol: "https", hostname: "**" }]`, which is an open
 * image proxy: `/_next/image?url=…` would fetch and re-serve any HTTPS URL on
 * earth for anyone who asked. Nothing needed that. Every image source this
 * console renders comes from one of two places — the GoPasal API's own origin
 * (product photos resolved by the local storage provider) or the CDN/bucket host
 * an `s3` deployment resolves them to — so those are what is listed.
 *
 * `NEXT_PUBLIC_API_URL` is the same variable `@gopasal/api-client` reads, so the
 * allowlist cannot drift from the origin the app actually talks to. Its protocol
 * is honoured rather than forced to `https`, because local development runs the
 * API on plain `http://localhost:4000` and a photo that 404s in dev teaches a
 * seller-facing screen nothing.
 *
 * `NEXT_PUBLIC_IMAGE_HOSTS` covers the `s3` case, where `publicUrl` returns a
 * bucket or CDN host the console has no other way to learn — storage config lives
 * in the API's environment, not this one. Unset in local dev, where the API origin
 * serves the bytes itself.
 *
 * An unresolvable or absent value yields no pattern rather than a wildcard: a
 * console with no API configured has no photos to draw either, and the catalog
 * falls back to its letter tile.
 *
 * A wildcard host is refused outright, loudly. `new URL("https://**")` parses
 * happily and yields the hostname `**`, so `NEXT_PUBLIC_IMAGE_HOSTS="**"` — or a
 * plausible-looking `*.cdn.example.com` — would put back exactly the open image
 * proxy this function exists to remove, and `*` alone would do it in one character.
 * Dropping such a value silently would leave an operator wondering why their photos
 * 404; throwing stops the console from starting at all, which is the right failure
 * for a misconfiguration whose quiet outcome is "anyone may proxy anything through
 * us". Concrete hosts only, one per entry.
 */
function imagePatterns(): { protocol: "http" | "https"; hostname: string; port?: string }[] {
  const patterns: { protocol: "http" | "https"; hostname: string; port?: string }[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, defaultProtocol: "http" | "https") => {
    const value = raw?.trim();
    if (!value || value.startsWith("__")) return;
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `${defaultProtocol}://${value}`);
    } catch {
      return;
    }
    if (url.hostname.includes("*")) {
      throw new Error(
        `Refusing to allow the wildcard image host "${url.hostname}". next/image would then fetch and re-serve arbitrary URLs through this console. List each host on its own.`,
      );
    }
    const protocol = url.protocol === "http:" ? "http" : "https";
    const key = `${protocol}//${url.hostname}:${url.port}`;
    if (seen.has(key)) return;
    seen.add(key);
    patterns.push({ protocol, hostname: url.hostname, ...(url.port ? { port: url.port } : {}) });
  };

  add(process.env.NEXT_PUBLIC_API_URL, "https");
  for (const host of (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "").split(",")) add(host, "https");
  return patterns;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not a build output, so Next has to
  // compile them itself.
  transpilePackages: ["@gopasal/api-client", "@gopasal/tokens", "@gopasal/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: imagePatterns(),
  },
};

export default nextConfig;
