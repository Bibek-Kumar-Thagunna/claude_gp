/**
 * Strongly-typed configuration loaded once at boot. Every module reads config
 * through ConfigService<AppConfig> — no `process.env` scattered across the code.
 *
 * Two rules govern this file, and they are what make a credential-free local
 * environment safe rather than merely convenient:
 *
 *  1. Every external service is reached through an interface, and the concrete
 *     implementation is chosen HERE by a `*_PROVIDER` variable. Local
 *     development selects an implementation that genuinely works offline (the
 *     SMS provider prints the message, the map provider computes distances
 *     locally, storage writes to disk / MinIO). Production selects the vendor.
 *
 *  2. A provider is never silently downgraded. If you ask for Sparrow and the
 *     token is absent, `validateConfig` refuses to start instead of quietly
 *     logging the one-time code and reporting success. Every "it looked like it
 *     worked" bug in this class of code comes from a fallback nobody chose.
 *
 * `validateConfig` therefore runs in EVERY environment, not just production —
 * a misconfigured development machine should also say so, loudly, at boot.
 */

/** Providers that actually have an implementation behind them. */
export const SMS_PROVIDERS = ["log", "sparrow", "twilio"] as const;
export const MAP_PROVIDERS = ["osm", "mapbox", "baato"] as const;
export const PUSH_PROVIDERS = ["log", "expo"] as const;
export const STORAGE_PROVIDERS = ["local", "s3"] as const;
export const SUPPORT_ASSISTANT_PROVIDERS = ["knowledge", "openai"] as const;
export const MALWARE_SCAN_PROVIDERS = ["disabled", "clamav"] as const;
export const APP_ENVIRONMENTS = ["local", "test", "staging", "production"] as const;

export type SmsProviderName = (typeof SMS_PROVIDERS)[number];
export type MapProviderName = (typeof MAP_PROVIDERS)[number];

/** A per-surface client SDK override; every field unset means "use the default". */
export type MapSurfaceConfig = {
  provider?: string;
  token?: string;
  styleUrl?: string;
};
export type PushProviderName = (typeof PUSH_PROVIDERS)[number];
export type StorageProviderName = (typeof STORAGE_PROVIDERS)[number];
export type SupportAssistantProviderName = (typeof SUPPORT_ASSISTANT_PROVIDERS)[number];
export type MalwareScanProviderName = (typeof MALWARE_SCAN_PROVIDERS)[number];
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export interface AppConfig {
  env: AppEnvironment;
  isProduction: boolean;
  /** Staging and production share the same fail-closed security policy. */
  isDeployed: boolean;
  port: number;
  apiPrefix: string;
  /** Absolute base URL this API is reachable at — used to build public file URLs. */
  publicUrl: string;
  /** False when `publicUrl` is the localhost default rather than a configured value. */
  publicUrlConfigured: boolean;
  /** Customer web origin used for payment redirects and merchant website identity. */
  customerWebUrl: string;
  customerWebUrlConfigured: boolean;
  corsOrigins: string[];
  /** False when `corsOrigins` is the localhost default rather than a configured value. */
  corsOriginsConfigured: boolean;
  /** Express trusted-proxy setting. False means the direct peer is the client. */
  trustProxy: false | number | string[];
  trustProxyConfigured: boolean;
  /**
   * Whether `GET /<prefix>/docs` is mounted. Off in production unless asked for:
   * the document lists every route, every DTO property and every validation
   * constraint in the API, which is a map of the attack surface handed out
   * unauthenticated. On by default everywhere else, where it is how the consoles
   * are developed against it.
   */
  docsEnabled: boolean;
  metrics: {
    /** Internal Prometheus listener. It is deliberately separate from the public API port. */
    enabled: boolean;
    host: string;
    port: number;
  };
  database: { url: string };
  redis: { host: string; port: number; password?: string };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  otp: {
    ttl: number;
    length: number;
    maxAttempts: number;
    /** Seconds a phone must wait between two code requests. */
    resendCooldown: number;
    /** Hard ceiling on codes sent to one phone per hour. */
    maxPerHour: number;
  };
  sms: {
    provider: SmsProviderName;
    /** `log` provider only: also append messages here (JSONL) for local testing. */
    devOutboxFile?: string;
    sparrow: { token?: string; from?: string; url: string };
    twilio: { sid?: string; token?: string; from?: string };
    timeoutMs: number;
  };
  maps: {
    provider: MapProviderName;
    mapboxToken?: string;
    /** Server-only token for Baato search, place, reverse and routing calls. */
    baatoToken?: string;
    /** Origin-restricted browser token used only to load the Baato MapLibre style. */
    baatoBrowserToken?: string;
    baatoStyle?: string;
    baatoBaseUrl?: string;
    /** Safety limit on server-side upstream requests; browser tile credits are separate and not counted here. */
    baatoServerMonthlyLimit?: number;
    /** Public MapLibre style JSON URL used when MAP_PROVIDER=osm. */
    styleUrl?: string;
    /**
     * Which SDK each app surface should render with, when it differs from the
     * server's own provider. Client-side only — routing and geocoding always
     * use `provider`.
     */
    surfaces?: {
      pin: MapSurfaceConfig;
      tracking: MapSurfaceConfig;
    };
  };
  payments: {
    codEnabled: boolean;
    esewa: { merchant?: string; secret?: string; baseUrl: string };
    khalti: { secret?: string; baseUrl: string };
  };
  push: {
    provider: PushProviderName;
    /**
     * Only needed when the Expo project has enhanced security enabled. Absent
     * is the normal case, including in production for most projects.
     */
    expoAccessToken?: string;
  };
  supportAssistant: {
    provider: SupportAssistantProviderName;
    openai: { apiKey?: string; model: string; baseUrl: string };
    timeoutMs: number;
  };
  malwareScan: {
    provider: MalwareScanProviderName;
    host?: string;
    port: number;
    connectTimeoutMs: number;
    scanTimeoutMs: number;
  };
  storage: {
    provider: StorageProviderName;
    local: { dir: string; publicBaseUrl?: string };
    /**
     * Set to run a production instance on `local` storage anyway. Off by
     * default because uploads — including KYC scans — would live on one
     * instance's disk and disappear with it.
     */
    allowLocalInProduction: boolean;
    s3: {
      endpoint?: string;
      region: string;
      bucket?: string;
      accessKey?: string;
      secretKey?: string;
      /** MinIO and most S3 clones need path-style addressing. */
      forcePathStyle: boolean;
      /** CDN or public bucket URL; falls back to the endpoint. */
      publicBaseUrl?: string;
    };
  };
  /**
   * Ceilings for the upload endpoints. Two of them because the risk is not the
   * same: a product image is a photo, a KYC document may be a multi-page scan.
   */
  uploads: {
    maxImageBytes: number;
    maxDocumentBytes: number;
  };
  realtime: {
    riderPingMinIntervalMs: number;
    riderLocationStaleMs: number;
    riderOfflineMs: number;
    maxOrderSubscriptions: number;
    maxSubscriptionChangesPerMinute: number;
  };
}

export const DEV_ACCESS_SECRET = "dev_access_secret_change_me";
export const DEV_REFRESH_SECRET = "dev_refresh_secret_change_me";

/**
 * `.env.example` ships literal `__REPLACE_ME__` placeholders so the file is
 * self-documenting. Reading one back means "not configured" — treating it as a
 * real credential is how you end up POSTing the string `__REPLACE_ME__` to a
 * payment gateway and reading the rejection as a network error.
 */
const PLACEHOLDERS = new Set(["__replace_me__", "replace_me", "changeme", "todo"]);

export const str = (v: string | undefined): string | undefined => {
  const t = (v ?? "").trim();
  if (t === "" || PLACEHOLDERS.has(t.toLowerCase())) return undefined;
  return t;
};
const int = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: string | undefined, fallback = false): boolean =>
  str(v) === undefined
    ? fallback
    : ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());

export default (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const env = (str(source.APP_ENV) ?? "") as AppEnvironment;
  const isProduction = env === "production";
  const isDeployed = env === "staging" || isProduction;
  const allowsUnsafeDevelopment = env === "local" || env === "test";
  const port = int(source.PORT, 4000);
  const trustProxyRaw = str(source.TRUST_PROXY);
  const trustProxy = (() => {
    if (!trustProxyRaw || trustProxyRaw.toLowerCase() === "false") return false;
    if (/^\d+$/.test(trustProxyRaw)) return Number(trustProxyRaw);
    return trustProxyRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  })();
  return {
    env,
    isProduction,
    isDeployed,
    port,
    apiPrefix: source.API_PREFIX ?? "api",
    publicUrl: (str(source.PUBLIC_URL) ?? `http://localhost:${port}`).replace(/\/+$/, ""),
    publicUrlConfigured: str(source.PUBLIC_URL) !== undefined,
    customerWebUrl: (str(source.CUSTOMER_WEB_URL) ?? "http://localhost:3000").replace(/\/+$/, ""),
    customerWebUrlConfigured: str(source.CUSTOMER_WEB_URL) !== undefined,
    corsOrigins: (str(source.CORS_ORIGINS) ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    corsOriginsConfigured: str(source.CORS_ORIGINS) !== undefined,
    trustProxy,
    trustProxyConfigured: trustProxyRaw !== undefined,
    // Default follows the environment rather than a fixed value, so nobody has to
    // remember to turn it off. `API_DOCS_ENABLED=true` is the deliberate override.
    docsEnabled: bool(source.API_DOCS_ENABLED, allowsUnsafeDevelopment),
    metrics: {
      // Local development stays single-port unless explicitly requested. A
      // deployed API must expose this internal listener so alerting is based on
      // application truth rather than only on whether a pod exists.
      enabled: bool(source.METRICS_ENABLED, isDeployed),
      host: str(source.METRICS_HOST) ?? "0.0.0.0",
      port: int(source.METRICS_PORT, 9464),
    },
    database: { url: str(source.DATABASE_URL) ?? "" },
    redis: {
      host: str(source.REDIS_HOST) ?? "localhost",
      port: int(source.REDIS_PORT, 6379),
      password: str(source.REDIS_PASSWORD),
    },
    jwt: {
      // Secrets may only fall back outside production; `validateConfig` refuses
      // to start a production instance still carrying these values.
      accessSecret: str(source.JWT_ACCESS_SECRET) ?? DEV_ACCESS_SECRET,
      refreshSecret: str(source.JWT_REFRESH_SECRET) ?? DEV_REFRESH_SECRET,
      accessTtl: int(source.JWT_ACCESS_TTL, 900),
      refreshTtl: int(source.JWT_REFRESH_TTL, 2592000),
    },
    otp: {
      ttl: int(source.OTP_TTL, 300),
      length: int(source.OTP_LENGTH, 6),
      maxAttempts: int(source.OTP_MAX_ATTEMPTS, 5),
      resendCooldown: int(source.OTP_RESEND_COOLDOWN, 60),
      maxPerHour: int(source.OTP_MAX_PER_HOUR, 5),
    },
    sms: {
      provider: (str(source.SMS_PROVIDER) ?? "log") as SmsProviderName,
      devOutboxFile: str(source.SMS_DEV_OUTBOX_FILE),
      sparrow: {
        token: str(source.SPARROW_SMS_TOKEN),
        from: str(source.SPARROW_SMS_FROM),
        url: str(source.SPARROW_SMS_URL) ?? "https://api.sparrowsms.com/v2/sms/",
      },
      twilio: {
        sid: str(source.TWILIO_ACCOUNT_SID),
        token: str(source.TWILIO_AUTH_TOKEN),
        from: str(source.TWILIO_FROM),
      },
      timeoutMs: int(source.SMS_TIMEOUT_MS, 10000),
    },
    maps: {
      // Local default needs no key and makes no server-side map API requests.
      // Its public demo style is convenient locally and refused in production.
      provider: (str(source.MAP_PROVIDER) ?? "osm") as MapProviderName,
      mapboxToken: str(source.MAPBOX_ACCESS_TOKEN),
      baatoToken: str(source.BAATO_ACCESS_TOKEN),
      baatoBrowserToken: str(source.BAATO_BROWSER_ACCESS_TOKEN),
      baatoStyle: str(source.BAATO_MAP_STYLE) ?? "breeze",
      baatoBaseUrl: (str(source.BAATO_API_BASE_URL) ?? "https://api.baato.io/api/v1").replace(
        /\/+$/,
        "",
      ),
      baatoServerMonthlyLimit: int(source.BAATO_SERVER_MONTHLY_LIMIT, 1200),
      styleUrl: str(source.MAP_STYLE_URL),
      /**
       * Per-surface client SDK overrides.
       *
       * The server keeps ONE map provider for routing and geocoding — that is
       * what `provider` above selects, and it is where the credits are spent
       * server-side. These only tell the apps which SDK and token to render
       * with on each surface, and they exist because the two surfaces have
       * completely different volumes: picking a pin happens once per address
       * and effectively never again, while tracking happens once per order and
       * scales with the business. Putting them on the same vendor bucket wastes
       * whichever allowance is scarcer.
       *
       * Unset means "same as the server provider", which is the sane default
       * and keeps existing deployments unchanged.
       */
      surfaces: {
        pin: {
          provider: str(source.MAP_PIN_PROVIDER),
          token: str(source.MAP_PIN_BROWSER_TOKEN),
          styleUrl: str(source.MAP_PIN_STYLE_URL),
        },
        tracking: {
          provider: str(source.MAP_TRACKING_PROVIDER),
          token: str(source.MAP_TRACKING_BROWSER_TOKEN),
          styleUrl: str(source.MAP_TRACKING_STYLE_URL),
        },
      },
    },
    payments: {
      codEnabled: bool(source.PAYMENTS_COD_ENABLED, true),
      esewa: {
        merchant: str(source.ESEWA_MERCHANT_CODE),
        secret: str(source.ESEWA_SECRET),
        // Defaults to eSewa's UAT host: development and staging talk to the real
        // sandbox rather than to a pretend gateway of our own.
        baseUrl: str(source.ESEWA_BASE_URL) ?? "https://rc-epay.esewa.com.np",
      },
      khalti: {
        secret: str(source.KHALTI_SECRET_KEY),
        baseUrl: str(source.KHALTI_BASE_URL) ?? "https://dev.khalti.com",
      },
    },
    push: {
      provider: (str(source.PUSH_PROVIDER) ?? "log") as PushProviderName,
      expoAccessToken: str(source.EXPO_ACCESS_TOKEN),
    },
    supportAssistant: {
      provider: (str(source.SUPPORT_ASSISTANT_PROVIDER) ??
        "knowledge") as SupportAssistantProviderName,
      openai: {
        apiKey: str(source.OPENAI_API_KEY),
        model: str(source.OPENAI_SUPPORT_MODEL) ?? "gpt-5-mini",
        baseUrl: (str(source.OPENAI_BASE_URL) ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      },
      timeoutMs: int(source.SUPPORT_ASSISTANT_TIMEOUT_MS, 15000),
    },
    malwareScan: {
      provider: (str(source.MALWARE_SCAN_PROVIDER) ?? "disabled") as MalwareScanProviderName,
      host: str(source.CLAMAV_HOST),
      port: int(source.CLAMAV_PORT, 13310),
      connectTimeoutMs: int(source.CLAMAV_CONNECT_TIMEOUT_MS, 2000),
      scanTimeoutMs: int(source.CLAMAV_SCAN_TIMEOUT_MS, 30000),
    },
    storage: {
      provider: (str(source.STORAGE_PROVIDER) ?? "local") as StorageProviderName,
      local: {
        dir: str(source.STORAGE_LOCAL_DIR) ?? "uploads",
        publicBaseUrl: str(source.STORAGE_LOCAL_PUBLIC_BASE_URL),
      },
      allowLocalInProduction: bool(source.STORAGE_LOCAL_ALLOW_IN_PRODUCTION, false),
      s3: {
        endpoint: str(source.S3_ENDPOINT),
        region: str(source.S3_REGION) ?? "us-east-1",
        bucket: str(source.S3_BUCKET),
        accessKey: str(source.S3_ACCESS_KEY),
        secretKey: str(source.S3_SECRET_KEY),
        forcePathStyle: bool(source.S3_FORCE_PATH_STYLE, true),
        publicBaseUrl: str(source.S3_PUBLIC_BASE_URL),
      },
    },
    uploads: {
      // 5 MiB / 10 MiB. Generous for a phone photo, small enough that a hundred
      // concurrent uploads cannot exhaust the process — files are buffered in
      // memory before they are handed to the storage provider.
      maxImageBytes: int(source.UPLOAD_MAX_IMAGE_BYTES, 5 * 1024 * 1024),
      maxDocumentBytes: int(source.UPLOAD_MAX_DOCUMENT_BYTES, 10 * 1024 * 1024),
    },
    realtime: {
      riderPingMinIntervalMs: int(source.RIDER_PING_MIN_INTERVAL_MS, 3000),
      riderLocationStaleMs: int(source.RIDER_LOCATION_STALE_MS, 15000),
      riderOfflineMs: int(source.RIDER_OFFLINE_MS, 30000),
      maxOrderSubscriptions: int(source.REALTIME_MAX_ORDER_SUBSCRIPTIONS, 20),
      maxSubscriptionChangesPerMinute: int(source.REALTIME_MAX_SUBSCRIPTION_CHANGES_PER_MINUTE, 60),
    },
  };
};

export interface ConfigReport {
  /** Things that make this configuration wrong. Boot must not continue. */
  problems: string[];
  /** Things that are legal but worth saying out loud at boot. */
  warnings: string[];
}

const listOf = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(", ");

/**
 * The absolute ceiling multer is given on any multipart route, independent of the
 * configured per-purpose limits.
 *
 * It exists because a multer limit has to be a literal at decoration time, before
 * any `ConfigService` exists, and because it is the wrong layer to make tunable:
 * this is a bound on what one request may make this process hold in memory, not a
 * business rule about how big a citizenship photo may be. The configured ceilings
 * are what an applicant is actually judged against, and `validateConfig` refuses
 * to start if one of them is set above this number — a file between the two would
 * be truncated by multer and then rejected for the wrong reason.
 */
export const MULTIPART_HARD_LIMIT_BYTES = 32 * 1024 * 1024;

/**
 * Inspect a resolved configuration without throwing, so it can be unit-tested
 * and so `main.ts` can print every problem at once instead of one per restart.
 */
export function inspectConfig(cfg: AppConfig): ConfigReport {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!APP_ENVIRONMENTS.includes(cfg.env)) {
    problems.push(`APP_ENV must be set to one of ${listOf(APP_ENVIRONMENTS)}`);
  }

  if (cfg.metrics.port < 1 || cfg.metrics.port > 65535) {
    problems.push("METRICS_PORT must be between 1 and 65535");
  }
  if (cfg.metrics.port === cfg.port) {
    problems.push("METRICS_PORT must differ from PORT so metrics are not exposed by the public API ingress");
  }
  if (cfg.isDeployed && !cfg.metrics.enabled) {
    problems.push(`METRICS_ENABLED must be true in ${cfg.env}`);
  }

  // ── provider selection ────────────────────────────────────────────────────
  // An unknown name is always a hard error. Falling back to a working default
  // here would hide a typo in production, where the difference between "sparrow"
  // and "sparow" is the difference between customers logging in and not.
  if (!SMS_PROVIDERS.includes(cfg.sms.provider)) {
    problems.push(
      `SMS_PROVIDER="${cfg.sms.provider}" is not implemented (choose ${listOf(SMS_PROVIDERS)})`,
    );
  }
  if (!MAP_PROVIDERS.includes(cfg.maps.provider)) {
    problems.push(
      `MAP_PROVIDER="${cfg.maps.provider}" is not implemented (choose ${listOf(MAP_PROVIDERS)})`,
    );
  }
  if (!PUSH_PROVIDERS.includes(cfg.push.provider)) {
    problems.push(
      `PUSH_PROVIDER="${cfg.push.provider}" is not implemented (choose ${listOf(PUSH_PROVIDERS)}). ` +
        "In-app notifications are unaffected.",
    );
  }
  if (!STORAGE_PROVIDERS.includes(cfg.storage.provider)) {
    problems.push(
      `STORAGE_PROVIDER="${cfg.storage.provider}" is not implemented (choose ${listOf(STORAGE_PROVIDERS)})`,
    );
  }
  if (!SUPPORT_ASSISTANT_PROVIDERS.includes(cfg.supportAssistant.provider)) {
    problems.push(
      `SUPPORT_ASSISTANT_PROVIDER="${cfg.supportAssistant.provider}" is not implemented (choose ${listOf(SUPPORT_ASSISTANT_PROVIDERS)})`,
    );
  }
  if (!MALWARE_SCAN_PROVIDERS.includes(cfg.malwareScan.provider)) {
    problems.push(`MALWARE_SCAN_PROVIDER="${cfg.malwareScan.provider}" is not implemented (choose ${listOf(MALWARE_SCAN_PROVIDERS)})`);
  }
  if (cfg.malwareScan.provider === "clamav" && !cfg.malwareScan.host) {
    problems.push("MALWARE_SCAN_PROVIDER=clamav requires CLAMAV_HOST");
  }
  if (cfg.malwareScan.port < 1 || cfg.malwareScan.port > 65535) {
    problems.push("CLAMAV_PORT must be between 1 and 65535");
  }
  if (cfg.malwareScan.connectTimeoutMs < 100 || cfg.malwareScan.connectTimeoutMs > 10000) {
    problems.push("CLAMAV_CONNECT_TIMEOUT_MS must be between 100 and 10000");
  }
  if (cfg.malwareScan.scanTimeoutMs < 1000 || cfg.malwareScan.scanTimeoutMs > 120000) {
    problems.push("CLAMAV_SCAN_TIMEOUT_MS must be between 1000 and 120000");
  }
  if (cfg.isDeployed && cfg.malwareScan.provider !== "clamav") {
    problems.push(`MALWARE_SCAN_PROVIDER=clamav is required in ${cfg.env}; uploaded files must be scanned before storage`);
  }
  if (cfg.isDeployed && cfg.malwareScan.provider === "clamav" && ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(cfg.malwareScan.host ?? "")) {
    problems.push(`CLAMAV_HOST must be a private scanner service address in ${cfg.env}`);
  }
  if (!cfg.isDeployed && cfg.malwareScan.provider === "disabled") {
    warnings.push("MALWARE_SCAN_PROVIDER=disabled — local uploads are not malware-scanned; use the ClamAV container to test the production gate");
  }

  // ── credentials for whatever was selected ─────────────────────────────────
  if (cfg.sms.provider === "sparrow") {
    if (!cfg.sms.sparrow.token) problems.push("SMS_PROVIDER=sparrow requires SPARROW_SMS_TOKEN");
    if (!cfg.sms.sparrow.from)
      problems.push("SMS_PROVIDER=sparrow requires SPARROW_SMS_FROM (approved sender ID)");
  }
  if (cfg.sms.provider === "twilio") {
    if (!cfg.sms.twilio.sid) problems.push("SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID");
    if (!cfg.sms.twilio.token) problems.push("SMS_PROVIDER=twilio requires TWILIO_AUTH_TOKEN");
    if (!cfg.sms.twilio.from) problems.push("SMS_PROVIDER=twilio requires TWILIO_FROM");
  }
  if (cfg.maps.provider === "mapbox" && !cfg.maps.mapboxToken) {
    problems.push(
      "MAP_PROVIDER=mapbox requires MAPBOX_ACCESS_TOKEN. Use MAP_PROVIDER=osm for a key-free local setup.",
    );
  }
  if (cfg.maps.provider === "baato") {
    if (!Number.isInteger(cfg.maps.baatoServerMonthlyLimit) || (cfg.maps.baatoServerMonthlyLimit ?? 0) < 1) {
      problems.push("BAATO_SERVER_MONTHLY_LIMIT must be a positive integer");
    }
    if (!cfg.maps.baatoToken) {
      problems.push("MAP_PROVIDER=baato requires BAATO_ACCESS_TOKEN for server-side map APIs");
    }
    if (!cfg.maps.baatoBrowserToken) {
      problems.push(
        "MAP_PROVIDER=baato requires BAATO_BROWSER_ACCESS_TOKEN restricted to the customer and seller web origins",
      );
    }
    if (
      cfg.maps.baatoStyle &&
      !/^(breeze|monochrome|dark|retro|roads|black_white)$/.test(cfg.maps.baatoStyle)
    ) {
      problems.push(
        "BAATO_MAP_STYLE must be one of breeze, monochrome, dark, retro, roads, black_white",
      );
    }
    try {
      const base = new URL(cfg.maps.baatoBaseUrl ?? "https://api.baato.io/api/v1");
      if (base.protocol !== "https:") problems.push("BAATO_API_BASE_URL must use HTTPS");
    } catch {
      problems.push("BAATO_API_BASE_URL must be an absolute HTTPS URL");
    }
  }
  const pin = cfg.maps.surfaces?.pin;
  const tracking = cfg.maps.surfaces?.tracking;
  if (pin?.provider && ![cfg.maps.provider, "google"].includes(pin.provider)) {
    problems.push("MAP_PIN_PROVIDER must match MAP_PROVIDER or be google");
  }
  if (pin?.provider === "google" && !pin.token) {
    problems.push("MAP_PIN_PROVIDER=google requires MAP_PIN_BROWSER_TOKEN");
  }
  if (tracking?.provider && tracking.provider !== cfg.maps.provider) {
    problems.push("MAP_TRACKING_PROVIDER must match MAP_PROVIDER (Google tracking is not supported)");
  }
  if (cfg.maps.styleUrl) {
    try {
      const style = new URL(cfg.maps.styleUrl);
      if (!["http:", "https:"].includes(style.protocol)) {
        problems.push("MAP_STYLE_URL must use http or https");
      }
    } catch {
      problems.push("MAP_STYLE_URL must be an absolute URL to a MapLibre style JSON document");
    }
  }
  if (cfg.storage.provider === "s3") {
    if (!cfg.storage.s3.bucket) problems.push("STORAGE_PROVIDER=s3 requires S3_BUCKET");
    if (!cfg.storage.s3.accessKey) problems.push("STORAGE_PROVIDER=s3 requires S3_ACCESS_KEY");
    if (!cfg.storage.s3.secretKey) problems.push("STORAGE_PROVIDER=s3 requires S3_SECRET_KEY");
  }
  if (cfg.supportAssistant.provider === "openai" && !cfg.supportAssistant.openai.apiKey) {
    problems.push("SUPPORT_ASSISTANT_PROVIDER=openai requires OPENAI_API_KEY");
  }
  try {
    const openAiBaseUrl = new URL(cfg.supportAssistant.openai.baseUrl);
    if (!["http:", "https:"].includes(openAiBaseUrl.protocol)) {
      problems.push("OPENAI_BASE_URL must use http or https");
    }
    if (
      cfg.isDeployed &&
      cfg.supportAssistant.provider === "openai" &&
      openAiBaseUrl.protocol !== "https:"
    ) {
      problems.push(`OPENAI_BASE_URL must use HTTPS in ${cfg.env}`);
    }
  } catch {
    problems.push("OPENAI_BASE_URL must be an absolute URL");
  }
  if (!cfg.supportAssistant.openai.model) {
    problems.push("OPENAI_SUPPORT_MODEL must not be empty");
  }
  if (cfg.supportAssistant.timeoutMs < 1000 || cfg.supportAssistant.timeoutMs > 60000) {
    problems.push("SUPPORT_ASSISTANT_TIMEOUT_MS must be between 1000 and 60000");
  }
  // ── upload ceilings ───────────────────────────────────────────────────────
  // Uploaded bytes are buffered in this process before they are handed to the
  // storage provider, so these two numbers are the only thing standing between a
  // handful of concurrent uploads and the heap. A ceiling of zero would reject
  // every upload while looking like a tuning value, so it is refused outright.
  if (cfg.uploads.maxImageBytes <= 0) {
    problems.push(
      "UPLOAD_MAX_IMAGE_BYTES must be greater than 0 — a zero ceiling rejects every image",
    );
  }
  if (cfg.uploads.maxDocumentBytes <= 0) {
    problems.push(
      "UPLOAD_MAX_DOCUMENT_BYTES must be greater than 0 — a zero ceiling rejects every document",
    );
  }
  const mib = (n: number): string => `${Math.round(n / (1024 * 1024))} MiB`;
  if (cfg.uploads.maxImageBytes > MULTIPART_HARD_LIMIT_BYTES) {
    problems.push(
      `UPLOAD_MAX_IMAGE_BYTES=${mib(cfg.uploads.maxImageBytes)} is above the multipart hard limit of ` +
        `${mib(MULTIPART_HARD_LIMIT_BYTES)}, so a file between the two would be cut off mid-request and the ` +
        "uploader would be told the wrong thing. Lower it, or raise MULTIPART_HARD_LIMIT_BYTES in code.",
    );
  }
  if (cfg.uploads.maxDocumentBytes > MULTIPART_HARD_LIMIT_BYTES) {
    problems.push(
      `UPLOAD_MAX_DOCUMENT_BYTES=${mib(cfg.uploads.maxDocumentBytes)} is above the multipart hard limit of ` +
        `${mib(MULTIPART_HARD_LIMIT_BYTES)}, so a file between the two would be cut off mid-request and the ` +
        "uploader would be told the wrong thing. Lower it, or raise MULTIPART_HARD_LIMIT_BYTES in code.",
    );
  }
  const IMPLAUSIBLE_UPLOAD_BYTES = 16 * 1024 * 1024;
  if (cfg.uploads.maxImageBytes > IMPLAUSIBLE_UPLOAD_BYTES) {
    warnings.push(
      `UPLOAD_MAX_IMAGE_BYTES=${mib(cfg.uploads.maxImageBytes)} is large for a photo — each concurrent ` +
        "upload of that size is held in memory before it is stored",
    );
  }
  if (cfg.uploads.maxDocumentBytes > IMPLAUSIBLE_UPLOAD_BYTES) {
    warnings.push(
      `UPLOAD_MAX_DOCUMENT_BYTES=${mib(cfg.uploads.maxDocumentBytes)} is large for a scan — each concurrent ` +
        "upload of that size is held in memory before it is stored",
    );
  }

  // A half-configured gateway is worse than a disabled one: checkout would
  // offer a method that cannot complete. These stay off until both halves exist.
  const esewa = cfg.payments.esewa;
  if (Boolean(esewa.merchant) !== Boolean(esewa.secret)) {
    problems.push("eSewa needs BOTH ESEWA_MERCHANT_CODE and ESEWA_SECRET, or neither");
  }
  // Gateway credentials must never be sent to an invalid or clear-text endpoint.
  // These URLs are configuration, but treating configuration as trusted is how a
  // typo such as `http://` quietly turns a merchant secret into network traffic.
  for (const [name, value] of [
    ["ESEWA_BASE_URL", esewa.baseUrl],
    ["KHALTI_BASE_URL", cfg.payments.khalti.baseUrl],
    ["SPARROW_SMS_URL", cfg.sms.sparrow.url],
  ] as const) {
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        problems.push(`${name} must use http or https`);
      }
      if (parsed.username || parsed.password) {
        problems.push(`${name} must not contain credentials in the URL`);
      }
      if (cfg.isDeployed && parsed.protocol !== "https:") {
        problems.push(`${name} must use HTTPS in ${cfg.env}`);
      }
    } catch {
      problems.push(`${name} must be an absolute URL`);
    }
  }
  if (cfg.isDeployed && esewa.merchant && /rc-epay|uat\./i.test(esewa.baseUrl)) {
    problems.push(`ESEWA_BASE_URL points to a sandbox in ${cfg.env}`);
  }
  if (
    cfg.isDeployed &&
    cfg.payments.khalti.secret &&
    /(^|\/)dev\./i.test(cfg.payments.khalti.baseUrl)
  ) {
    problems.push(`KHALTI_BASE_URL points to the sandbox in ${cfg.env}`);
  }

  // ── OTP safety rails ──────────────────────────────────────────────────────
  if (cfg.otp.length < 4) problems.push("OTP_LENGTH must be at least 4");
  if (cfg.otp.maxAttempts < 1) problems.push("OTP_MAX_ATTEMPTS must be at least 1");
  if (cfg.otp.maxAttempts > 10) {
    warnings.push(
      `OTP_MAX_ATTEMPTS=${cfg.otp.maxAttempts} is high — a ${cfg.otp.length}-digit code is guessable`,
    );
  }
  if (cfg.otp.resendCooldown < 30) {
    warnings.push(
      `OTP_RESEND_COOLDOWN=${cfg.otp.resendCooldown}s is short — SMS costs money and invites abuse`,
    );
  }
  if (!cfg.isDeployed && cfg.sms.provider === "log") {
    warnings.push(
      "SMS_PROVIDER=log — one-time codes are printed to THIS log, not delivered to phones",
    );
  }

  // ── CORS ──────────────────────────────────────────────────────────────────
  // `main.ts` enables CORS with `credentials: true`, which is what makes these
  // two cases errors rather than preferences.
  //
  // A wildcard cannot work at all under credentialed CORS: the browser refuses a
  // response whose `Access-Control-Allow-Origin` is `*` when the request carried
  // credentials, and the `cors` package compares an array entry by equality, so
  // `*` would never be echoed back in the first place. Somebody writing it means
  // "allow everything" and would get "allow nothing", diagnosed as a network bug.
  if (cfg.corsOrigins.includes("*")) {
    problems.push(
      'CORS_ORIGINS cannot contain "*" — this API is called with credentials, and a browser rejects a ' +
        "wildcard origin on a credentialed response. List the console origins explicitly.",
    );
  }
  // Set, but to nothing usable (`CORS_ORIGINS=","`). Says it was configured while
  // allowing no browser at all.
  if (cfg.corsOriginsConfigured && cfg.corsOrigins.length === 0) {
    problems.push(
      "CORS_ORIGINS is set but lists no origin — every browser request would be refused",
    );
  }

  for (const [name, value] of [
    ["RIDER_PING_MIN_INTERVAL_MS", cfg.realtime.riderPingMinIntervalMs],
    ["RIDER_LOCATION_STALE_MS", cfg.realtime.riderLocationStaleMs],
    ["RIDER_OFFLINE_MS", cfg.realtime.riderOfflineMs],
    ["REALTIME_MAX_ORDER_SUBSCRIPTIONS", cfg.realtime.maxOrderSubscriptions],
    ["REALTIME_MAX_SUBSCRIPTION_CHANGES_PER_MINUTE", cfg.realtime.maxSubscriptionChangesPerMinute],
  ] as const) {
    if (!Number.isFinite(value) || value < 1) problems.push(`${name} must be a positive integer`);
  }

  // ── deployed environments: refuse development values ─────────────────────
  if (cfg.isDeployed) {
    if (cfg.jwt.accessSecret === DEV_ACCESS_SECRET)
      problems.push("JWT_ACCESS_SECRET is still the development value");
    if (cfg.jwt.refreshSecret === DEV_REFRESH_SECRET)
      problems.push("JWT_REFRESH_SECRET is still the development value");
    if (cfg.jwt.accessSecret === cfg.jwt.refreshSecret) {
      problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
    }
    if (!cfg.database.url) problems.push("DATABASE_URL is not set");
    if (cfg.sms.provider === "log") {
      problems.push(
        `SMS_PROVIDER=log cannot be used in ${cfg.env} — one-time codes would be written to the ` +
          "server log instead of reaching the customer. Set SMS_PROVIDER=sparrow (or twilio).",
      );
    }
    if (cfg.sms.devOutboxFile) {
      problems.push(
        `SMS_DEV_OUTBOX_FILE must not be set in ${cfg.env} — it would write one-time codes to disk`,
      );
    }
    if (!cfg.publicUrlConfigured) {
      problems.push(
        `PUBLIC_URL must be set in ${cfg.env} — links in notifications and file URLs are built from it`,
      );
    }
    if (!cfg.customerWebUrlConfigured) {
      problems.push(
        `CUSTOMER_WEB_URL must be set in ${cfg.env} — payment callbacks need a trusted customer-app destination`,
      );
    }
    if (cfg.maps.provider === "osm" && !cfg.maps.styleUrl) {
      problems.push(
        `MAP_PROVIDER=osm requires MAP_STYLE_URL in ${cfg.env} — the local default uses MapLibre's public demo tiles, which are not a production tile service`,
      );
    }
    for (const [name, value] of [
      ["PUBLIC_URL", cfg.publicUrl],
      ["CUSTOMER_WEB_URL", cfg.customerWebUrl],
    ] as const) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") problems.push(`${name} must use https in ${cfg.env}`);
        if (url.hostname === "example.invalid" || url.hostname.endsWith(".example.invalid")) {
          problems.push(`${name} still uses the reserved example.invalid deployment placeholder`);
        }
      } catch {
        problems.push(`${name} must be a valid absolute URL`);
      }
    }
    // The CORS default is `http://localhost:3000`, and an unset variable used to
    // reach production as exactly that: an API the real consoles cannot call,
    // failing in the browser as an opaque CORS error with nothing in the server
    // log to explain it. An origin allowlist is not something to infer.
    if (!cfg.corsOriginsConfigured) {
      problems.push(
        `CORS_ORIGINS must be set in ${cfg.env} — it defaults to http://localhost:3000, so the customer, ` +
          "seller and admin consoles would all be refused by the browser. List their origins, comma-separated.",
      );
    }
    for (const origin of cfg.corsOrigins) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== "https:") {
          problems.push(`CORS_ORIGINS entry must use https in ${cfg.env}: ${origin}`);
        }
        if (parsed.origin !== origin) {
          problems.push(`CORS_ORIGINS entry must be an origin only (scheme and host, no path): ${origin}`);
        }
        if (
          parsed.hostname === "example.invalid" ||
          parsed.hostname.endsWith(".example.invalid")
        ) {
          problems.push(`CORS_ORIGINS still contains the reserved deployment placeholder: ${origin}`);
        }
      } catch {
        problems.push(`CORS_ORIGINS entry must be a valid absolute origin: ${origin}`);
      }
    }
    const localOrigins = cfg.corsOrigins.filter((o) =>
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/i.test(o),
    );
    if (localOrigins.length > 0) {
      problems.push(
        `CORS_ORIGINS must not contain local origins in ${cfg.env}: ${localOrigins.join(", ")}`,
      );
    }
    if (!cfg.trustProxyConfigured) {
      problems.push(
        `TRUST_PROXY must be explicitly set in ${cfg.env} (false, a hop count, or trusted CIDRs)`,
      );
    }
    if (
      Array.isArray(cfg.trustProxy) &&
      cfg.trustProxy.some((entry) => entry === "*" || entry.toLowerCase() === "true")
    ) {
      problems.push("TRUST_PROXY must name trusted proxy hops or CIDRs, not trust every peer");
    }
    const localHost = (value: string): boolean => {
      try {
        const host = new URL(value).hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1";
      } catch {
        return false;
      }
    };
    if (localHost(cfg.database.url))
      problems.push(`DATABASE_URL must not use a local host in ${cfg.env}`);
    if (["localhost", "127.0.0.1", "::1"].includes(cfg.redis.host)) {
      problems.push(`REDIS_HOST must not use a local host in ${cfg.env}`);
    }
    if (cfg.storage.s3.endpoint && localHost(cfg.storage.s3.endpoint)) {
      problems.push(`S3_ENDPOINT must not use a local host in ${cfg.env}`);
    }
    // Legal, and sometimes wanted on a private staging host — but it publishes
    // every route, DTO property and validation rule to anyone who asks, so it
    // does not happen quietly.
    if (cfg.docsEnabled) {
      warnings.push(
        `API_DOCS_ENABLED=true in ${cfg.env} — /docs publishes every route and request schema to ` +
          "unauthenticated callers. Leave it unset unless this instance is meant to be a public sandbox.",
      );
    }
    // Local disk in production is refused rather than warned about, because the
    // files at stake now include KYC documents: an instance replacement would
    // silently take a seller's citizenship scans with it and the application
    // rows would keep pointing at bytes that no longer exist. The escape hatch is
    // explicit and named, for the single long-lived server that really does have
    // its own backups.
    if (cfg.storage.provider === "local") {
      problems.push(
        `STORAGE_PROVIDER=local cannot be used in ${cfg.env} — use durable STORAGE_PROVIDER=s3`,
      );
    }
    if (cfg.push.provider === "log") {
      warnings.push("PUSH_PROVIDER=log — no device push is sent; in-app notifications still work");
    }
    if (!cfg.payments.esewa.merchant && !cfg.payments.khalti.secret) {
      warnings.push("No online payment gateway is configured — Cash on Delivery only");
    }
  }

  return { problems, warnings };
}

/**
 * Boot gate. Throws one aggregated error listing everything that is wrong, so a
 * misconfigured deployment is fixed in a single pass rather than one restart at
 * a time. Runs in development too — a dev machine that asks for a provider it
 * has no credentials for should hear about it immediately.
 */
export function validateConfig(cfg: AppConfig): ConfigReport {
  const report = inspectConfig(cfg);
  if (report.problems.length > 0) {
    throw new Error(
      `Refusing to start — ${cfg.env} configuration is incomplete:\n` +
        report.problems.map((p) => `  - ${p}`).join("\n") +
        "\n\nSee apps/api/.env.example: every provider documents its development and production setup.",
    );
  }
  return report;
}
