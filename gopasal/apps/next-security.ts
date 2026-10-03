import path from "node:path";

export interface NextConfigShape {
  images?: Record<string, unknown>;
  headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
  [key: string]: unknown;
}

const APP_ENVIRONMENTS = ["local", "test", "staging", "production"] as const;
type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export function nextEnvironment(source: NodeJS.ProcessEnv = process.env): { env: AppEnvironment; deployed: boolean } {
  const env = source.APP_ENV as AppEnvironment | undefined;
  if (!env || !APP_ENVIRONMENTS.includes(env)) {
    throw new Error(`APP_ENV must be set to one of: ${APP_ENVIRONMENTS.join(", ")}`);
  }
  return { env, deployed: env === "staging" || env === "production" };
}

export function configuredImageUrls(deployed: boolean, source: NodeJS.ProcessEnv = process.env): URL[] {
  const apiValue = source.NEXT_PUBLIC_API_URL?.trim();
  if (deployed && (!apiValue || apiValue.startsWith("__"))) {
    throw new Error("NEXT_PUBLIC_API_URL is required in staging and production");
  }
  const candidates = [
    { value: source.NEXT_PUBLIC_API_URL, originOnly: true },
    ...(source.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
      .split(",")
      .map((value) => ({ value, originOnly: true })),
    // The admin coverage map uses ordinary <img> raster tiles. The full value
    // is a {z}/{x}/{y} template, so only its origin belongs in CSP/image rules.
    { value: source.NEXT_PUBLIC_MAP_TILE_URL, originOnly: false },
  ];
  const urls: URL[] = [];
  for (const candidate of candidates) {
    const value = candidate.value?.trim();
    if (!value || value.startsWith("__")) continue;
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (url.hostname.includes("*")) throw new Error(`Wildcard image host is prohibited: ${url.hostname}`);
    if (deployed) {
      if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
        throw new Error(`Unsafe deployed URL is prohibited: ${value}`);
      }
      if (url.hostname === "invalid" || url.hostname.endsWith(".invalid")) {
        throw new Error(`Reserved deployment placeholder is prohibited: ${value}`);
      }
      if (candidate.originOnly && url.origin !== value) {
        throw new Error(`Deployed URL must be an origin only (scheme and host, no path): ${value}`);
      }
    }
    urls.push(url);
  }
  return urls;
}

export function productionSecurityHeaders(apiOrigin: string, urls: URL[], googleMaps = false): Array<{ key: string; value: string }> {
  const connectSources = new Set(["'self'", apiOrigin, apiOrigin.replace(/^http/, "ws"), "https://api.baato.io"]);
  const imageSources = new Set(["'self'", "data:", "blob:", "https://api.baato.io", ...urls.map((url) => url.origin)]);
  if (googleMaps) {
    for (const host of ["https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com"]) {
      connectSources.add(host);
      imageSources.add(host);
    }
    // Maps imagery can be served from these hosts even when the JS library
    // itself was loaded from googleapis.com.
    imageSources.add("https://*.googleusercontent.com");
    imageSources.add("https://*.ggpht.com");
  }
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    `font-src 'self' data:${googleMaps ? " https://fonts.gstatic.com" : ""}`,
    `img-src ${Array.from(imageSources).join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${googleMaps ? " 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com https://*.google.com" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    ...(googleMaps ? ["frame-src https://*.google.com"] : []),
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=()" },
  ];
}

export function secureNextConfig<T extends NextConfigShape>(base: T): T & NextConfigShape {
  const { deployed } = nextEnvironment();
  const urls = configuredImageUrls(deployed);
  const remotePatterns = Array.from(new Map(urls.map((url) => [url.origin, {
    protocol: url.protocol === "http:" ? "http" as const : "https" as const,
    hostname: url.hostname,
    ...(url.port ? { port: url.port } : {}),
  }])).values());

  const runtime = {
    ...base,
    // Produce the minimal self-contained server tree consumed by the production
    // images. Tracing from the monorepo root includes only workspace packages
    // actually referenced by this app, not the complete development install.
    output: "standalone",
    outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
    images: { ...base.images, remotePatterns },
  };

  if (!deployed) return runtime;

  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL!).origin;
  const securityHeaders = productionSecurityHeaders(apiOrigin, urls, process.env.MAP_PIN_PROVIDER === "google");

  return {
    ...runtime,
    async headers() {
      const inherited = await base.headers?.() ?? [];
      return [...inherited, { source: "/(.*)", headers: securityHeaders }];
    },
  };
}
