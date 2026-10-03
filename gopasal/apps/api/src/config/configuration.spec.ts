import assert from "node:assert/strict";
import { describe, it } from "node:test";
import configuration, {
  type AppConfig,
  DEV_ACCESS_SECRET,
  DEV_REFRESH_SECRET,
  inspectConfig,
  MULTIPART_HARD_LIMIT_BYTES,
  str,
  validateConfig,
} from "./configuration";

/**
 * The configuration loader is the single place where "this environment can run"
 * is decided, so these tests are less about parsing and more about the two rules
 * the file exists to enforce: a fresh clone boots with no credentials, and a
 * provider is never silently downgraded. Every case below is a boot that either
 * must succeed or must be refused by name.
 *
 * The loader takes its environment as an argument, so nothing here touches the
 * real `process.env` — the tests cannot be influenced by the machine they run on.
 */
const load = (over: NodeJS.ProcessEnv = {}): AppConfig =>
  configuration({ APP_ENV: "local", ...over });
const problemsOf = (over: NodeJS.ProcessEnv = {}): string[] => inspectConfig(load(over)).problems;
const warningsOf = (over: NodeJS.ProcessEnv = {}): string[] => inspectConfig(load(over)).warnings;
const mentioning = (list: string[], needle: string): string[] =>
  list.filter((p) => p.includes(needle));

/**
 * A production environment with nothing missing — the baseline to break in each
 * test. Storage is left on `local` with the explicit opt-in, so the production
 * cases below exercise the escape hatch rather than the s3 credential path.
 */
const PROD: NodeJS.ProcessEnv = {
  APP_ENV: "production",
  PUBLIC_URL: "https://api.gopasal.com",
  CUSTOMER_WEB_URL: "https://gopasal.com",
  CORS_ORIGINS: "https://gopasal.com,https://seller.gopasal.com,https://admin.gopasal.com",
  DATABASE_URL: "postgresql://gopasal:pw@db.internal:5432/gopasal?schema=public",
  REDIS_HOST: "redis.internal",
  JWT_ACCESS_SECRET: "a".repeat(64),
  JWT_REFRESH_SECRET: "b".repeat(64),
  SMS_PROVIDER: "sparrow",
  SPARROW_SMS_TOKEN: "real-token",
  SPARROW_SMS_FROM: "GoPasal",
  STORAGE_PROVIDER: "s3",
  MALWARE_SCAN_PROVIDER: "clamav",
  CLAMAV_HOST: "clamav.internal",
  S3_BUCKET: "gopasal",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret",
  TRUST_PROXY: "1",
  MAP_STYLE_URL: "https://maps.gopasal.com/style.json",
};

describe("configuration loader", () => {
  it("requires an explicit supported APP_ENV", () => {
    assert.match(inspectConfig(configuration({})).problems.join(" "), /APP_ENV must be set/);
    assert.match(
      inspectConfig(configuration({ APP_ENV: "preview" })).problems.join(" "),
      /APP_ENV must be set/,
    );
  });

  it("applies production safety rails to staging", () => {
    const found = inspectConfig(configuration({ APP_ENV: "staging" })).problems.join(" ");
    assert.match(found, /SMS_PROVIDER=log cannot be used in staging/);
    assert.match(found, /PUBLIC_URL must be set in staging/);
    assert.match(found, /TRUST_PROXY must be explicitly set in staging/);
    assert.match(found, /STORAGE_PROVIDER=local cannot be used in staging/);
  });

  it("boots a credential-free development environment on defaults alone", () => {
    const cfg = load();
    assert.equal(cfg.env, "local");
    assert.equal(cfg.isProduction, false);
    assert.equal(cfg.sms.provider, "log");
    assert.equal(cfg.maps.provider, "osm");
    assert.equal(cfg.push.provider, "log");
    assert.equal(cfg.storage.provider, "local");
    assert.equal(cfg.malwareScan.provider, "disabled");
    assert.equal(cfg.supportAssistant.provider, "knowledge");
    assert.equal(cfg.payments.codEnabled, true);
    assert.equal(cfg.metrics.enabled, false);
    assert.equal(cfg.metrics.port, 9464);
    assert.deepEqual(problemsOf(), []);
  });

  it("keeps production metrics on a separate internal port", () => {
    const cfg = configuration(PROD);
    assert.equal(cfg.metrics.enabled, true);
    assert.equal(cfg.metrics.host, "0.0.0.0");
    assert.equal(cfg.metrics.port, 9464);
    assert.match(
      inspectConfig(configuration({ ...PROD, METRICS_ENABLED: "false" })).problems.join(" "),
      /METRICS_ENABLED must be true/,
    );
    assert.match(
      problemsOf({ PORT: "4000", METRICS_PORT: "4000" }).join(" "),
      /METRICS_PORT must differ from PORT/,
    );
    assert.match(
      problemsOf({ METRICS_PORT: "70000" }).join(" "),
      /METRICS_PORT must be between 1 and 65535/,
    );
  });
  it("requires a real malware scanner in deployed environments", () => {
    assert.match(inspectConfig(configuration({ ...PROD, MALWARE_SCAN_PROVIDER: "disabled" })).problems.join(" "), /MALWARE_SCAN_PROVIDER=clamav is required/);
    assert.match(problemsOf({ MALWARE_SCAN_PROVIDER: "clamav" }).join(" "), /requires CLAMAV_HOST/);
    assert.match(inspectConfig(configuration({ ...PROD, CLAMAV_HOST: "127.0.0.1" })).problems.join(" "), /private scanner service address/);
    assert.deepEqual(mentioning(inspectConfig(configuration(PROD)).problems, "MALWARE_SCAN_PROVIDER"), []);
  });
  it("keeps the OTP rails at values worth having, without being told", () => {
    const cfg = load();
    assert.equal(cfg.otp.length, 6);
    assert.equal(cfg.otp.ttl, 300);
    assert.equal(cfg.otp.maxAttempts, 5);
    assert.equal(cfg.otp.resendCooldown, 60);
    assert.equal(cfg.otp.maxPerHour, 5);
  });

  it('reads a placeholder as "not configured" rather than as a credential', () => {
    assert.equal(str("__REPLACE_ME__"), undefined);
    assert.equal(str("  "), undefined);
    assert.equal(str("changeme"), undefined);
    assert.equal(str("  real  "), "real");
    assert.equal(load({ SPARROW_SMS_TOKEN: "__REPLACE_ME__" }).sms.sparrow.token, undefined);
    assert.equal(load({ MAPBOX_ACCESS_TOKEN: "" }).maps.mapboxToken, undefined);
  });

  it("defaults publicUrl to localhost but records that it was not configured", () => {
    const cfg = load({ PORT: "4100" });
    assert.equal(cfg.publicUrl, "http://localhost:4100");
    assert.equal(cfg.publicUrlConfigured, false);
  });

  it("trims trailing slashes off a configured publicUrl", () => {
    const cfg = load({ PUBLIC_URL: "https://api.gopasal.com//" });
    assert.equal(cfg.publicUrl, "https://api.gopasal.com");
    assert.equal(cfg.publicUrlConfigured, true);
  });

  it("reads the production MapLibre style URL", () => {
    assert.equal(
      load({ MAP_STYLE_URL: "https://maps.gopasal.com/style.json" }).maps.styleUrl,
      "https://maps.gopasal.com/style.json",
    );
  });

  it("allows a Google address picker only with its browser key and leaves tracking on the base map", () => {
    assert.ok(mentioning(problemsOf({ MAP_PIN_PROVIDER: "google" }), "MAP_PIN_BROWSER_TOKEN").length > 0);
    const maps = load({
      MAP_PROVIDER: "baato",
      BAATO_ACCESS_TOKEN: "server",
      BAATO_BROWSER_ACCESS_TOKEN: "browser",
      MAP_PIN_PROVIDER: "google",
      MAP_PIN_BROWSER_TOKEN: "google-browser",
    }).maps;
    assert.equal(maps.surfaces?.pin.provider, "google");
    assert.equal(maps.surfaces?.tracking.provider, undefined);
    assert.ok(mentioning(problemsOf({ MAP_TRACKING_PROVIDER: "google" }), "MAP_TRACKING_PROVIDER").length > 0);
  });

  it("parses booleans and falls back on unparseable numbers", () => {
    assert.equal(load({ PAYMENTS_COD_ENABLED: "false" }).payments.codEnabled, false);
    assert.equal(load({ PAYMENTS_COD_ENABLED: "yes" }).payments.codEnabled, true);
    assert.equal(load({ S3_FORCE_PATH_STYLE: "false" }).storage.s3.forcePathStyle, false);
    assert.equal(load({ S3_FORCE_PATH_STYLE: "" }).storage.s3.forcePathStyle, true);
    assert.equal(load({ OTP_TTL: "soon" }).otp.ttl, 300);
  });

  it("points payment gateways at the vendors' own sandboxes by default", () => {
    const cfg = load();
    assert.equal(cfg.payments.esewa.baseUrl, "https://rc-epay.esewa.com.np");
    assert.equal(cfg.payments.khalti.baseUrl, "https://dev.khalti.com");
  });
  it("ships upload ceilings that fit a phone photo and a multi-page scan", () => {
    const cfg = load();
    assert.equal(cfg.uploads.maxImageBytes, 5 * 1024 * 1024);
    assert.equal(cfg.uploads.maxDocumentBytes, 10 * 1024 * 1024);
    assert.equal(cfg.storage.allowLocalInProduction, false);
  });

  it("refuses an upload ceiling that would reject every file", () => {
    assert.equal(
      mentioning(problemsOf({ UPLOAD_MAX_IMAGE_BYTES: "0" }), "UPLOAD_MAX_IMAGE_BYTES").length,
      1,
    );
    assert.equal(
      mentioning(problemsOf({ UPLOAD_MAX_DOCUMENT_BYTES: "-1" }), "UPLOAD_MAX_DOCUMENT_BYTES")
        .length,
      1,
    );
  });

  it("warns — but does not refuse — an upload ceiling large enough to matter for memory", () => {
    // Above the "implausible for a scan" line, below the multipart hard limit:
    // legal, but every concurrent upload of that size is held in memory.
    const over = { UPLOAD_MAX_DOCUMENT_BYTES: String(24 * 1024 * 1024) };
    assert.equal(mentioning(warningsOf(over), "UPLOAD_MAX_DOCUMENT_BYTES=24 MiB").length, 1);
    assert.deepEqual(problemsOf(over), []);
  });

  /**
   * The multipart interceptor's limit is a literal, so a configured ceiling above
   * it would let multer truncate a file mid-request and the uploader would then be
   * told the wrong thing — "unsupported type", from sniffing a cut-off buffer.
   * Refusing to boot is the only honest answer.
   */
  it("refuses an upload ceiling above the multipart hard limit", () => {
    assert.equal(MULTIPART_HARD_LIMIT_BYTES, 32 * 1024 * 1024);

    const over = String(MULTIPART_HARD_LIMIT_BYTES + 1);
    const imageProblems = mentioning(
      problemsOf({ UPLOAD_MAX_IMAGE_BYTES: over }),
      "UPLOAD_MAX_IMAGE_BYTES",
    );
    assert.equal(imageProblems.length, 1);
    assert.match(imageProblems[0] ?? "", /multipart hard limit of 32 MiB/);

    const docProblems = mentioning(
      problemsOf({ UPLOAD_MAX_DOCUMENT_BYTES: String(200 * 1024 * 1024) }),
      "UPLOAD_MAX_DOCUMENT_BYTES=200 MiB",
    );
    assert.equal(docProblems.length, 1);
    assert.match(docProblems[0] ?? "", /multipart hard limit/);
  });

  it("accepts a ceiling exactly at the multipart hard limit", () => {
    const at = { UPLOAD_MAX_DOCUMENT_BYTES: String(MULTIPART_HARD_LIMIT_BYTES) };
    assert.deepEqual(problemsOf(at), []);
    assert.equal(load(at).uploads.maxDocumentBytes, MULTIPART_HARD_LIMIT_BYTES);
  });

  it("defaults the CORS allowlist to localhost but records that it was not configured", () => {
    const cfg = load();
    assert.deepEqual(cfg.corsOrigins, ["http://localhost:3000"]);
    assert.equal(cfg.corsOriginsConfigured, false);
    // An empty value is not a configuration — it used to resolve to `[]`, an API
    // no browser could call, with nothing saying so.
    assert.equal(load({ CORS_ORIGINS: "" }).corsOriginsConfigured, false);
    assert.deepEqual(load({ CORS_ORIGINS: "  " }).corsOrigins, ["http://localhost:3000"]);
  });

  it("splits and trims a configured CORS allowlist", () => {
    const cfg = load({ CORS_ORIGINS: "https://gopasal.com, https://seller.gopasal.com ," });
    assert.deepEqual(cfg.corsOrigins, ["https://gopasal.com", "https://seller.gopasal.com"]);
    assert.equal(cfg.corsOriginsConfigured, true);
  });

  it("mounts the docs outside production and not inside it, unless asked", () => {
    assert.equal(load().docsEnabled, true);
    assert.equal(load({ APP_ENV: "production" }).docsEnabled, false);
    assert.equal(load({ APP_ENV: "production", API_DOCS_ENABLED: "true" }).docsEnabled, true);
    assert.equal(load({ API_DOCS_ENABLED: "false" }).docsEnabled, false);
  });
  // MARKER-CONFIG-SPEC
});

describe("inspectConfig — provider selection", () => {
  it("refuses a provider name it has no implementation for, instead of falling back", () => {
    assert.equal(
      mentioning(problemsOf({ SMS_PROVIDER: "sparow" }), 'SMS_PROVIDER="sparow"').length,
      1,
    );
    assert.equal(
      mentioning(problemsOf({ MAP_PROVIDER: "google" }), 'MAP_PROVIDER="google"').length,
      1,
    );
    assert.equal(
      mentioning(problemsOf({ STORAGE_PROVIDER: "gcs" }), 'STORAGE_PROVIDER="gcs"').length,
      1,
    );
    assert.equal(
      mentioning(
        problemsOf({ SUPPORT_ASSISTANT_PROVIDER: "magic" }),
        'SUPPORT_ASSISTANT_PROVIDER="magic"',
      ).length,
      1,
    );
  });

  it("requires an API key only when the OpenAI support provider is selected", () => {
    assert.deepEqual(mentioning(problemsOf(), "OPENAI_API_KEY"), []);
    assert.equal(
      mentioning(problemsOf({ SUPPORT_ASSISTANT_PROVIDER: "openai" }), "OPENAI_API_KEY").length,
      1,
    );
    assert.deepEqual(
      mentioning(
        problemsOf({ SUPPORT_ASSISTANT_PROVIDER: "openai", OPENAI_API_KEY: "test-key" }),
        "OPENAI_API_KEY",
      ),
      [],
    );
  });

  it("requires a valid support endpoint and HTTPS when OpenAI is deployed", () => {
    assert.equal(
      mentioning(problemsOf({ OPENAI_BASE_URL: "not-a-url" }), "OPENAI_BASE_URL").length,
      1,
    );
    assert.equal(
      mentioning(
        problemsOf({
          ...PROD,
          SUPPORT_ASSISTANT_PROVIDER: "openai",
          OPENAI_API_KEY: "production-key",
          OPENAI_BASE_URL: "http://ai.internal.example/v1",
        }),
        "OPENAI_BASE_URL",
      ).length,
      1,
    );
  });

  it("refuses PUSH_PROVIDER=fcm and names the transports that do exist", () => {
    const [problem, ...rest] = mentioning(problemsOf({ PUSH_PROVIDER: "fcm" }), "PUSH_PROVIDER");
    assert.equal(rest.length, 0);
    // Not the prose — the choices. This message used to explain that there was
    // no device-token registry to deliver to, which stopped being true the day
    // one was added.
    assert.match(problem, /"expo"/);
    assert.match(problem, /"log"/);
    assert.match(problem, /in-app notifications are unaffected/i);
  });

  it("names the exact missing variable for Sparrow", () => {
    const found = problemsOf({ SMS_PROVIDER: "sparrow" });
    assert.equal(mentioning(found, "SPARROW_SMS_TOKEN").length, 1);
    assert.equal(mentioning(found, "SPARROW_SMS_FROM").length, 1);
    assert.deepEqual(
      problemsOf({ SMS_PROVIDER: "sparrow", SPARROW_SMS_TOKEN: "t", SPARROW_SMS_FROM: "GoPasal" }),
      [],
    );
  });

  it("names the exact missing variables for Twilio", () => {
    const found = problemsOf({ SMS_PROVIDER: "twilio" });
    assert.equal(mentioning(found, "TWILIO_ACCOUNT_SID").length, 1);
    assert.equal(mentioning(found, "TWILIO_AUTH_TOKEN").length, 1);
    assert.equal(mentioning(found, "TWILIO_FROM").length, 1);
  });

  it("refuses mapbox without a token and points at the key-free alternative", () => {
    const [problem] = mentioning(problemsOf({ MAP_PROVIDER: "mapbox" }), "MAPBOX_ACCESS_TOKEN");
    assert.match(problem, /MAP_PROVIDER=osm/);
    assert.deepEqual(problemsOf({ MAP_PROVIDER: "mapbox", MAPBOX_ACCESS_TOKEN: "pk.x" }), []);
  });

  it("requires separate Baato server and browser tokens", () => {
    const missing = problemsOf({ MAP_PROVIDER: "baato" });
    assert.equal(mentioning(missing, "BAATO_ACCESS_TOKEN").length, 1);
    assert.equal(mentioning(missing, "BAATO_BROWSER_ACCESS_TOKEN").length, 1);
    assert.deepEqual(
      problemsOf({
        MAP_PROVIDER: "baato",
        BAATO_ACCESS_TOKEN: "server-token",
        BAATO_BROWSER_ACCESS_TOKEN: "browser-token",
      }),
      [],
    );
  });

  it("rejects unsafe or unsupported Baato map settings", () => {
    const credentials = {
      MAP_PROVIDER: "baato",
      BAATO_ACCESS_TOKEN: "server-token",
      BAATO_BROWSER_ACCESS_TOKEN: "browser-token",
    };
    assert.match(
      problemsOf({ ...credentials, BAATO_MAP_STYLE: "invented" }).join(" "),
      /BAATO_MAP_STYLE/,
    );
    assert.match(
      problemsOf({ ...credentials, BAATO_API_BASE_URL: "http://api.baato.io/api/v1" }).join(
        " ",
      ),
      /must use HTTPS/,
    );
  });

  it("rejects malformed MapLibre style URLs", () => {
    assert.match(problemsOf({ MAP_STYLE_URL: "maps/style.json" }).join(" "), /absolute URL/);
    assert.match(
      problemsOf({ MAP_STYLE_URL: "file:///tmp/style.json" }).join(" "),
      /http or https/,
    );
  });

  it("refuses s3 storage without a bucket and keys", () => {
    const found = problemsOf({ STORAGE_PROVIDER: "s3" });
    assert.equal(mentioning(found, "S3_BUCKET").length, 1);
    assert.equal(mentioning(found, "S3_ACCESS_KEY").length, 1);
    assert.equal(mentioning(found, "S3_SECRET_KEY").length, 1);
  });

  it("accepts the documented MinIO setup as a complete s3 configuration", () => {
    assert.deepEqual(
      problemsOf({
        STORAGE_PROVIDER: "s3",
        S3_ENDPOINT: "http://localhost:19000",
        S3_BUCKET: "gopasal-dev",
        S3_ACCESS_KEY: "gopasal_dev",
        S3_SECRET_KEY: "gopasal_dev_secret",
      }),
      [],
    );
  });
});

describe("inspectConfig — payments and OTP rails", () => {
  it("refuses a half-configured eSewa, because checkout would offer a dead method", () => {
    assert.equal(
      mentioning(problemsOf({ ESEWA_MERCHANT_CODE: "EPAYTEST" }), "eSewa needs BOTH").length,
      1,
    );
    assert.equal(mentioning(problemsOf({ ESEWA_SECRET: "s" }), "eSewa needs BOTH").length, 1);
    assert.deepEqual(problemsOf({ ESEWA_MERCHANT_CODE: "EPAYTEST", ESEWA_SECRET: "s" }), []);
    assert.deepEqual(problemsOf(), []); // neither: gateway simply absent
  });

  it("refuses malformed or credential-bearing provider endpoints", () => {
    assert.match(problemsOf({ ESEWA_BASE_URL: "not-a-url" }).join(" "), /ESEWA_BASE_URL/);
    assert.match(
      problemsOf({ KHALTI_BASE_URL: "https://user:password@khalti.example" }).join(" "),
      /KHALTI_BASE_URL must not contain credentials/,
    );
    assert.match(
      problemsOf({ SPARROW_SMS_URL: "file:///tmp/sms" }).join(" "),
      /SPARROW_SMS_URL must use http or https/,
    );
  });

  it("requires encrypted provider endpoints in deployed environments", () => {
    const found = problemsOf({
      ...PROD,
      ESEWA_BASE_URL: "http://pay.example.com",
      KHALTI_BASE_URL: "http://wallet.example.com",
      SPARROW_SMS_URL: "http://sms.example.com/v2/sms",
    }).join(" ");
    assert.match(found, /ESEWA_BASE_URL must use HTTPS in production/);
    assert.match(found, /KHALTI_BASE_URL must use HTTPS in production/);
    assert.match(found, /SPARROW_SMS_URL must use HTTPS in production/);
  });

  it("rejects an OTP short enough to guess", () => {
    assert.equal(
      mentioning(problemsOf({ OTP_LENGTH: "3" }), "OTP_LENGTH must be at least 4").length,
      1,
    );
    assert.deepEqual(problemsOf({ OTP_LENGTH: "4" }), []);
  });

  it("rejects an OTP challenge that can never be answered", () => {
    assert.equal(
      mentioning(problemsOf({ OTP_MAX_ATTEMPTS: "0" }), "OTP_MAX_ATTEMPTS must be at least 1")
        .length,
      1,
    );
  });

  it("warns — but does not refuse — when the rails are merely loose", () => {
    assert.equal(
      mentioning(warningsOf({ OTP_MAX_ATTEMPTS: "50" }), "OTP_MAX_ATTEMPTS=50").length,
      1,
    );
    assert.deepEqual(problemsOf({ OTP_MAX_ATTEMPTS: "50" }), []);
    assert.equal(
      mentioning(warningsOf({ OTP_RESEND_COOLDOWN: "5" }), "OTP_RESEND_COOLDOWN=5s").length,
      1,
    );
  });

  it("says out loud, in development, that codes are printed and not delivered", () => {
    const [warning] = mentioning(warningsOf(), "SMS_PROVIDER=log");
    assert.match(warning, /not delivered to phones/);
  });
});

describe("inspectConfig — production refusals", () => {
  it("accepts a fully configured production environment", () => {
    assert.deepEqual(problemsOf(PROD), []);
  });

  it("refuses to start production on the development JWT secrets", () => {
    const found = problemsOf({
      ...PROD,
      JWT_ACCESS_SECRET: DEV_ACCESS_SECRET,
      JWT_REFRESH_SECRET: DEV_REFRESH_SECRET,
    });
    assert.equal(mentioning(found, "JWT_ACCESS_SECRET is still the development value").length, 1);
    assert.equal(mentioning(found, "JWT_REFRESH_SECRET is still the development value").length, 1);
  });

  it("refuses one secret used for both tokens", () => {
    const same = "c".repeat(64);
    const found = problemsOf({ ...PROD, JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same });
    assert.equal(mentioning(found, "must differ").length, 1);
  });

  it("refuses SMS_PROVIDER=log in production, where the code must reach a phone", () => {
    const [problem] = mentioning(
      problemsOf({ ...PROD, SMS_PROVIDER: "log" }),
      "SMS_PROVIDER=log cannot be used",
    );
    assert.match(problem, /instead of reaching the customer/);
  });

  it("refuses to write one-time codes to disk in production", () => {
    const found = problemsOf({ ...PROD, SMS_DEV_OUTBOX_FILE: "./tmp/sms.jsonl" });
    assert.equal(mentioning(found, "SMS_DEV_OUTBOX_FILE must not be set in production").length, 1);
  });

  it("refuses production without PUBLIC_URL, since file URLs and links are built from it", () => {
    const found = problemsOf({ ...PROD, PUBLIC_URL: "" });
    assert.equal(mentioning(found, "PUBLIC_URL must be set in production").length, 1);
  });

  it("requires trusted HTTPS public and customer origins in production", () => {
    assert.match(
      problemsOf({ ...PROD, PUBLIC_URL: "http://api.gopasal.com" }).join(" "),
      /PUBLIC_URL must use https/,
    );
    assert.match(
      problemsOf({ ...PROD, CUSTOMER_WEB_URL: "http://gopasal.com" }).join(" "),
      /CUSTOMER_WEB_URL must use https/,
    );
  });

  it("refuses reserved deployment placeholder domains", () => {
    const found = problemsOf({
      ...PROD,
      PUBLIC_URL: "https://api.example.invalid",
      CUSTOMER_WEB_URL: "https://app.example.invalid",
      CORS_ORIGINS: "https://app.example.invalid,https://seller.example.invalid",
    }).join(" ");
    assert.match(found, /PUBLIC_URL still uses the reserved example\.invalid/);
    assert.match(found, /CUSTOMER_WEB_URL still uses the reserved example\.invalid/);
    assert.match(found, /CORS_ORIGINS still contains the reserved deployment placeholder/);
  });

  it("refuses the public MapLibre demo style as an implicit production dependency", () => {
    const found = problemsOf({ ...PROD, MAP_STYLE_URL: "" });
    assert.match(found.join(" "), /MAP_PROVIDER=osm requires MAP_STYLE_URL/);
  });

  it("refuses production without a database", () => {
    const found = problemsOf({ ...PROD, DATABASE_URL: "" });
    assert.equal(mentioning(found, "DATABASE_URL is not set").length, 1);
  });

  it("warns about production choices that are legal but consequential", () => {
    const found = warningsOf(PROD);
    assert.equal(mentioning(found, "PUSH_PROVIDER=log").length, 1);
    assert.equal(mentioning(found, "No online payment gateway is configured").length, 1);
  });

  it("refuses local storage in production even with the legacy opt-in", () => {
    const found = problemsOf({
      ...PROD,
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ALLOW_IN_PRODUCTION: "true",
    });
    const [problem] = mentioning(found, "STORAGE_PROVIDER=local cannot be used in production");
    assert.match(problem, /STORAGE_PROVIDER=s3/);
  });

  it("accepts s3 storage in production without the opt-in", () => {
    assert.deepEqual(
      problemsOf({
        ...PROD,
        STORAGE_LOCAL_ALLOW_IN_PRODUCTION: "",
        STORAGE_PROVIDER: "s3",
        S3_BUCKET: "gopasal",
        S3_ACCESS_KEY: "key",
        S3_SECRET_KEY: "secret",
      }),
      [],
    );
  });

  it("stops warning about payments once a gateway is configured", () => {
    const found = warningsOf({ ...PROD, KHALTI_SECRET_KEY: "live_secret" });
    assert.deepEqual(mentioning(found, "No online payment gateway"), []);
  });

  it("reports every problem at once rather than one restart at a time", () => {
    const found = problemsOf({
      APP_ENV: "production",
      SMS_PROVIDER: "twilio",
      STORAGE_PROVIDER: "s3",
      MAP_PROVIDER: "mapbox",
    });
    // Keep this aggregate check resilient as production rails grow: the named
    // failures below are what an operator needs to fix, not a magic count.
    assert.ok(found.length >= 12);
    assert.ok(found.some((problem) => problem.includes("CUSTOMER_WEB_URL")));
    assert.ok(found.some((problem) => problem.includes("PUBLIC_URL")));
  });
});

/**
 * CORS is enabled in `main.ts` with `credentials: true`, so the allowlist is not a
 * convenience setting — it is the list of browsers permitted to act as a signed-in
 * user. These cases are the three ways it used to go wrong silently.
 */
describe("inspectConfig — CORS allowlist", () => {
  it("refuses a wildcard, which cannot work under credentialed CORS anyway", () => {
    const [problem] = mentioning(problemsOf({ CORS_ORIGINS: "*" }), "CORS_ORIGINS cannot contain");
    assert.match(problem, /called with credentials/);
    assert.equal(
      mentioning(problemsOf({ CORS_ORIGINS: "https://gopasal.com,*" }), "cannot contain").length,
      1,
    );
  });

  it("refuses an allowlist that was set but names nobody", () => {
    const found = problemsOf({ CORS_ORIGINS: " , , " });
    assert.equal(mentioning(found, "CORS_ORIGINS is set but lists no origin").length, 1);
    // Unset is a different case: development falls back to the documented default.
    assert.deepEqual(mentioning(problemsOf(), "CORS_ORIGINS"), []);
  });

  it("refuses production on the localhost default, which no console can use", () => {
    const [problem] = mentioning(
      problemsOf({ ...PROD, CORS_ORIGINS: "" }),
      "CORS_ORIGINS must be set in production",
    );
    assert.match(problem, /http:\/\/localhost:3000/);
    assert.match(problem, /refused by the browser/);
  });

  it("refuses when a deployed allowlist still carries a developer origin", () => {
    const over = {
      ...PROD,
      CORS_ORIGINS: "https://gopasal.com,http://localhost:3001,http://127.0.0.1:3002",
    };
    const [problem] = mentioning(problemsOf(over), "CORS_ORIGINS must not contain local origins");
    assert.match(problem, /http:\/\/localhost:3001/);
    assert.match(problem, /http:\/\/127\.0\.0\.1:3002/);
    assert.doesNotMatch(problem, /https:\/\/gopasal\.com/);
    // A production allowlist of real origins says nothing at all.
    assert.deepEqual(mentioning(warningsOf(PROD), "CORS_ORIGINS"), []);
  });

  it("requires exact HTTPS origins in a deployed allowlist", () => {
    const found = problemsOf({
      ...PROD,
      CORS_ORIGINS: "seller.gopasal.com,http://admin.gopasal.com,https://gopasal.com/account",
    }).join(" ");
    assert.match(found, /valid absolute origin: seller\.gopasal\.com/);
    assert.match(found, /must use https in production: http:\/\/admin\.gopasal\.com/);
    assert.match(found, /no path.*https:\/\/gopasal\.com\/account/);
  });
});

/**
 * The OpenAPI document describes every route and every request schema, so whether
 * it is mounted is a disclosure decision. It follows the environment by default and
 * says so out loud when a production instance opts back in.
 */
describe("inspectConfig — API docs", () => {
  it("says nothing when the docs are where they belong", () => {
    assert.deepEqual(mentioning(warningsOf(), "API_DOCS_ENABLED"), []);
    assert.deepEqual(mentioning(warningsOf(PROD), "API_DOCS_ENABLED"), []);
  });

  it("warns — but does not refuse — a production instance that publishes them", () => {
    const over = { ...PROD, API_DOCS_ENABLED: "true" };
    const [warning] = mentioning(warningsOf(over), "API_DOCS_ENABLED=true in production");
    assert.match(warning, /unauthenticated callers/);
    assert.deepEqual(problemsOf(over), []);
  });
});

describe("validateConfig", () => {
  it("throws one aggregated, actionable error naming the environment", () => {
    assert.throws(
      () => validateConfig(load({ APP_ENV: "production", SMS_PROVIDER: "sparrow" })),
      (err: Error) => {
        assert.match(err.message, /^Refusing to start — production configuration is incomplete:/);
        assert.match(err.message, /- SMS_PROVIDER=sparrow requires SPARROW_SMS_TOKEN/);
        assert.match(err.message, /apps\/api\/\.env\.example/);
        return true;
      },
    );
  });

  it("returns the report — warnings included — when the configuration is usable", () => {
    const report = validateConfig(load());
    assert.deepEqual(report.problems, []);
    assert.ok(report.warnings.length > 0);
  });

  it("lets a fresh clone of .env.example boot untouched", () => {
    // The values below are exactly what .env.example ships, uncommented.
    assert.doesNotThrow(() =>
      validateConfig(
        load({
          APP_ENV: "local",
          NODE_ENV: "development",
          PORT: "4000",
          API_PREFIX: "api",
          TRUST_PROXY: "false",
          CORS_ORIGINS: "http://localhost:3000,http://localhost:3001,http://localhost:3002",
          DATABASE_URL: "postgresql://gopasal:gopasal_dev_pw@localhost:15432/gopasal?schema=public",
          REDIS_HOST: "localhost",
          REDIS_PORT: "6380",
          JWT_ACCESS_SECRET: DEV_ACCESS_SECRET,
          JWT_REFRESH_SECRET: DEV_REFRESH_SECRET,
          OTP_TTL: "300",
          OTP_LENGTH: "6",
          OTP_MAX_ATTEMPTS: "5",
          OTP_RESEND_COOLDOWN: "60",
          OTP_MAX_PER_HOUR: "5",
          SMS_PROVIDER: "log",
          SMS_TIMEOUT_MS: "10000",
          MAP_PROVIDER: "osm",
          STORAGE_PROVIDER: "local",
          STORAGE_LOCAL_DIR: "uploads",
          S3_REGION: "us-east-1",
          S3_FORCE_PATH_STYLE: "true",
          PAYMENTS_COD_ENABLED: "true",
          ESEWA_BASE_URL: "https://rc-epay.esewa.com.np",
          KHALTI_BASE_URL: "https://dev.khalti.com",
          PUSH_PROVIDER: "log",
        }),
      ),
    );
  });
});
