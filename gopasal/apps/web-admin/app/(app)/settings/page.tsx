"use client";

import * as React from "react";
import {
  SlidersHorizontal,
  Building2,
  MapPin,
  Percent,
  Banknote,
  Bell,
  Plug,
  Sparkles,
  ShieldCheck,
  Save,
  RotateCcw,
  Info,
  Lock,
  KeyRound,
  Languages,
  Plus,
  X,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  Field,
  inputCls,
  Switch,
  KeyValue,
} from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useLang } from "@/components/providers";
import { useAuth } from "@/components/auth-provider";
import { CITY_MIX } from "@/lib/data";
import { rs, num } from "@/lib/format";

/**
 * Platform configuration. Business rules live here; secrets never do — the
 * integrations panel shows only the environment variable NAME the server reads,
 * so a key is set once on the machine and never typed into a browser.
 */
type Config = {
  legalName: string;
  tradingName: string;
  supportPhone: string;
  supportEmail: string;
  defaultLang: "en" | "np";
  cities: string[];
  deliveryRadiusKm: number;
  maxRadiusKm: number;
  commissionPct: number;
  codCeiling: number;
  codRemitDays: number;
  payoutDay: string;
  minOrder: number;
  features: {
    groupOrders: boolean;
    loyalty: boolean;
    referrals: boolean;
    gold: boolean;
    sponsored: boolean;
    ratings: boolean;
  };
  notify: {
    orderSms: boolean;
    payoutEmail: boolean;
    disputeEscalation: boolean;
    fraudDigest: boolean;
  };
};

const DEFAULTS: Config = {
  legalName: "Velayon Dynamics Pvt. Ltd.",
  tradingName: "GoPasal",
  supportPhone: "9801000000",
  supportEmail: "support@gopasal.com",
  defaultLang: "en",
  cities: ["Kathmandu", "Lalitpur", "Bhaktapur", "Pokhara"],
  deliveryRadiusKm: 5,
  maxRadiusKm: 12,
  commissionPct: 8.1,
  codCeiling: 25_000,
  codRemitDays: 2,
  payoutDay: "Monday",
  minOrder: 200,
  features: {
    groupOrders: true,
    loyalty: true,
    referrals: true,
    gold: true,
    sponsored: true,
    ratings: true,
  },
  notify: {
    orderSms: true,
    payoutEmail: true,
    disputeEscalation: true,
    fraudDigest: false,
  },
};

/** Server-side integrations. Only the variable name is ever shown. */
const INTEGRATIONS: {
  group: string;
  icon: typeof Plug;
  rows: { label: string; env: string; note: string }[];
}[] = [
  {
    group: "Maps and live rider location",
    icon: MapPin,
    rows: [
      { label: "Map provider", env: "MAP_PROVIDER", note: "mapbox or google — swappable" },
      { label: "Mapbox token", env: "MAPBOX_ACCESS_TOKEN", note: "server side" },
      { label: "Browser map token", env: "NEXT_PUBLIC_MAP_PROVIDER / NEXT_PUBLIC_MAPBOX_TOKEN", note: "public, scoped token" },
      { label: "Google Maps key", env: "GOOGLE_MAPS_API_KEY", note: "used when the provider is google" },
    ],
  },
  {
    group: "One-time codes and SMS",
    icon: Bell,
    rows: [
      { label: "SMS provider", env: "SMS_PROVIDER", note: "log, sparrow or twilio" },
      { label: "Sparrow SMS", env: "SPARROW_SMS_TOKEN / SPARROW_SMS_FROM", note: "Nepal sender" },
      { label: "Twilio", env: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN", note: "fallback route" },
    ],
  },
  {
    group: "Payments",
    icon: Banknote,
    rows: [
      { label: "Cash on delivery", env: "PAYMENTS_COD_ENABLED", note: "on by default in Nepal" },
      { label: "eSewa", env: "ESEWA_MERCHANT_CODE / ESEWA_SECRET", note: "wallet checkout" },
      { label: "Khalti", env: "KHALTI_PUBLIC_KEY / KHALTI_SECRET_KEY", note: "wallet checkout" },
    ],
  },
  {
    group: "Push, storage and realtime",
    icon: Plug,
    rows: [
      { label: "Push provider", env: "PUSH_PROVIDER / FCM_SERVER_KEY", note: "order updates" },
      { label: "Image storage", env: "STORAGE_PROVIDER / S3_BUCKET / S3_ACCESS_KEY", note: "local or S3-compatible" },
      { label: "Rider ping window", env: "RIDER_PING_MIN_INTERVAL_MS", note: "throttles GPS writes" },
      { label: "Rider stale / offline", env: "RIDER_LOCATION_STALE_MS / RIDER_OFFLINE_MS", note: "when the map shows a warning" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <PermissionGate
      perm="rbac.platform.manage"
      title="You can’t change platform settings"
      description="Commission, delivery range and platform-wide switches need the “Manage platform roles” permission."
    >
      <SettingsInner />
    </PermissionGate>
  );
}

function SettingsInner() {
  const { lang, setLang } = useLang();
  const { user, roleName } = useAuth();
  const [cfg, setCfg] = React.useState<Config>(DEFAULTS);
  const [saved, setSaved] = React.useState<Config>(DEFAULTS);
  const [confirm, setConfirm] = React.useState(false);
  const [newCity, setNewCity] = React.useState("");

  const dirty = React.useMemo(
    () => JSON.stringify(cfg) !== JSON.stringify(saved),
    [cfg, saved],
  );

  const suggestions = React.useMemo(
    () => CITY_MIX.map((c) => c.city).filter((c) => !cfg.cities.includes(c)),
    [cfg.cities],
  );

  const addCity = (name: string) => {
    const city = name.trim();
    if (city.length < 3 || cfg.cities.includes(city)) return;
    setCfg({ ...cfg, cities: [...cfg.cities, city] });
    setNewCity("");
  };

  const setFeature = (k: keyof Config["features"], v: boolean) =>
    setCfg({ ...cfg, features: { ...cfg.features, [k]: v } });

  const setNotify = (k: keyof Config["notify"], v: boolean) =>
    setCfg({ ...cfg, notify: { ...cfg.notify, [k]: v } });

  const numField = (v: string, fallback: number) => {
    const n = Number.parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <>
      <PageHeader
        icon={<SlidersHorizontal className="h-5 w-5" />}
        title={lang === "np" ? "प्लेटफर्म सेटिङ" : "Platform settings"}
        subtitle={
          lang === "np"
            ? "कमिशन, डेलिभरी दायरा र सुविधाहरू — सबै पसलमा लागू हुन्छ"
            : "Rules that apply to every shop on GoPasal. Change them carefully — shops feel this the same day."
        }
        actions={
          <>
            <Badge tone={dirty ? "marigold" : "green"} dot>
              {dirty ? "Unsaved changes" : "All saved"}
            </Badge>
            <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setCfg(saved)}>
              <RotateCcw className="h-4 w-4" /> Undo
            </Button>
            <Button size="sm" disabled={!dirty} onClick={() => setConfirm(true)}>
              <Save className="h-4 w-4" /> Save settings
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Who GoPasal is"
              hint="Shown on invoices, policies and the public site"
              action={
                <Badge tone="crimson" dot={false}>
                  <Building2 className="h-3.5 w-3.5" /> Legal entity
                </Badge>
              }
            />
            <div className="space-y-4 px-5 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Registered company">
                  <input
                    className={inputCls}
                    value={cfg.legalName}
                    onChange={(e) => setCfg({ ...cfg, legalName: e.target.value })}
                  />
                </Field>
                <Field label="Trading name">
                  <input
                    className={inputCls}
                    value={cfg.tradingName}
                    onChange={(e) => setCfg({ ...cfg, tradingName: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Support number" hint="Answered in Nepali and English">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={cfg.supportPhone}
                    onChange={(e) => setCfg({ ...cfg, supportPhone: e.target.value })}
                  />
                </Field>
                <Field label="Support email">
                  <input
                    className={inputCls}
                    type="email"
                    value={cfg.supportEmail}
                    onChange={(e) => setCfg({ ...cfg, supportEmail: e.target.value })}
                  />
                </Field>
              </div>
              <Field
                label="Default language for new accounts"
                hint="Anyone can switch at any time"
              >
                <div className="flex items-center gap-2">
                  {(["en", "np"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={cfg.defaultLang === l}
                      onClick={() => setCfg({ ...cfg, defaultLang: l })}
                      className={
                        cfg.defaultLang === l
                          ? "flex items-center gap-2 rounded-xl border border-crimson-300 bg-crimson-50 px-3.5 py-2 text-sm font-bold text-crimson-800"
                          : "flex items-center gap-2 rounded-xl border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-600 transition hover:border-ink-300"
                      }
                    >
                      <Languages className="h-4 w-4" /> {l === "en" ? "English" : "नेपाली"}
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setLang(lang === "en" ? "np" : "en")}>
                    Switch my console to {lang === "en" ? "नेपाली" : "English"}
                  </Button>
                </div>
              </Field>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.06}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Where shops can deliver"
              hint="A shop delivers with its own people, inside a radius you allow"
              action={
                <Badge tone="marigold" dot={false}>
                  <MapPin className="h-3.5 w-3.5" /> {num(cfg.cities.length)} cities
                </Badge>
              }
            />
            <div className="space-y-4 px-5 pt-5">
              <div className="flex flex-wrap gap-2">
                {cfg.cities.map((city) => (
                  <span
                    key={city}
                    className="inline-flex items-center gap-1.5 rounded-full bg-crimson-50 px-3 py-1.5 text-xs font-semibold text-crimson-700"
                  >
                    {city}
                    <button
                      type="button"
                      aria-label={`Remove ${city}`}
                      onClick={() =>
                        setCfg({ ...cfg, cities: cfg.cities.filter((c) => c !== city) })
                      }
                      className="rounded-full p-0.5 transition hover:bg-crimson-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <Field label="Add a city" className="flex-1 min-w-[180px]">
                  <input
                    className={inputCls}
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCity(newCity);
                      }
                    }}
                    placeholder="Biratnagar"
                  />
                </Field>
                <Button variant="outline" size="sm" onClick={() => addCity(newCity)}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>

              {suggestions.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  Already trading:
                  {suggestions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => addCity(c)}
                      className="rounded-full border border-ink-200 px-2 py-0.5 font-semibold text-ink-600 transition hover:border-crimson-300 hover:text-crimson-700"
                    >
                      + {c}
                    </button>
                  ))}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Default delivery radius (km)"
                  hint="What a new shop starts with"
                >
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={String(cfg.deliveryRadiusKm)}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        deliveryRadiusKm: numField(e.target.value, cfg.deliveryRadiusKm),
                      })
                    }
                  />
                </Field>
                <Field label="Largest radius allowed (km)" hint="A shop cannot go past this">
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={String(cfg.maxRadiusKm)}
                    onChange={(e) =>
                      setCfg({ ...cfg, maxRadiusKm: numField(e.target.value, cfg.maxRadiusKm) })
                    }
                  />
                </Field>
              </div>

              <p className="flex items-start gap-2 rounded-xl bg-crimson-50/70 px-3.5 py-3 text-xs text-crimson-800">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                GoPasal never promises a delivery time — not on the site, not in the app, not in a
                notification. A shopkeeper says when they can bring it, and the customer watches the
                rider on the map. This rule is not configurable.
              </p>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal delay={0.06}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Commission and cash"
              hint="How GoPasal earns, and how quickly cash comes back"
              action={
                <Badge tone="crimson" dot={false}>
                  <Percent className="h-3.5 w-3.5" /> {cfg.commissionPct}% commission
                </Badge>
              }
            />
            <div className="space-y-4 px-5 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Commission (%)" hint="Taken from the order value, not the delivery">
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={String(cfg.commissionPct)}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        commissionPct: numField(e.target.value, cfg.commissionPct),
                      })
                    }
                  />
                </Field>
                <Field label="Smallest order (रु)" hint="Below this, checkout is blocked">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={String(cfg.minOrder)}
                    onChange={(e) =>
                      setCfg({ ...cfg, minOrder: numField(e.target.value, cfg.minOrder) })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Cash ceiling per order (रु)"
                  hint="Above this, only wallet or card is offered"
                >
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={String(cfg.codCeiling)}
                    onChange={(e) =>
                      setCfg({ ...cfg, codCeiling: numField(e.target.value, cfg.codCeiling) })
                    }
                  />
                </Field>
                <Field label="Remit cash within (days)" hint="Before the payout is held back">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={String(cfg.codRemitDays)}
                    onChange={(e) =>
                      setCfg({ ...cfg, codRemitDays: numField(e.target.value, cfg.codRemitDays) })
                    }
                  />
                </Field>
              </div>
              <Field label="Settlement day" hint="Payouts run once a week">
                <select
                  className={inputCls}
                  value={cfg.payoutDay}
                  onChange={(e) => setCfg({ ...cfg, payoutDay: e.target.value })}
                >
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="divide-y divide-ink-100 rounded-xl bg-ink-50 px-3.5">
                <KeyValue label="On a रु 1,000 order">
                  {rs(Math.round(1000 * (cfg.commissionPct / 100)))} to GoPasal
                </KeyValue>
                <KeyValue label="Shop receives">
                  {rs(1000 - Math.round(1000 * (cfg.commissionPct / 100)))}
                </KeyValue>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Features on the platform"
              hint="Switch a whole capability off if it is causing trouble"
              action={
                <Badge tone="green" dot={false}>
                  <Sparkles className="h-3.5 w-3.5" />{" "}
                  {num(Object.values(cfg.features).filter(Boolean).length)} on
                </Badge>
              }
            />
            <div className="px-5 pt-5">
              <ul className="divide-y divide-ink-100">
                {(
                  [
                    ["groupOrders", "Group orders", "Neighbours combine one delivery from a shop"],
                    ["loyalty", "Loyalty points", "Points earned on completed orders"],
                    ["referrals", "Referrals", "Both sides get a reward on the first order"],
                    ["gold", "GoPasal Gold", "Paid membership with waived delivery fees"],
                    ["sponsored", "Sponsored listings", "Shops pay to appear higher in search"],
                    ["ratings", "Ratings and reviews", "Shown only after a delivered order"],
                  ] as [keyof Config["features"], string, string][]
                ).map(([key, label, hint]) => (
                  <li key={key} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-800">{label}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
                    </div>
                    <Switch
                      checked={cfg.features[key]}
                      onChange={(v) => setFeature(key, v)}
                      label={label}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                Switching a feature off hides it everywhere at once. Anything a customer already
                earned — points, a membership, a referral reward — is kept and honoured.
              </p>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Reveal delay={0.06}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="What the platform sends"
              hint="Messages GoPasal itself sends, not a shop"
              action={
                <Badge tone="blue" dot={false}>
                  <Bell className="h-3.5 w-3.5" /> Alerts
                </Badge>
              }
            />
            <div className="px-5 pt-5">
              <ul className="divide-y divide-ink-100">
                {(
                  [
                    ["orderSms", "Order SMS to customers", "Placed, on the way, delivered"],
                    ["payoutEmail", "Payout summary to shops", "Sent on settlement day"],
                    [
                      "disputeEscalation",
                      "Dispute escalation to staff",
                      "When a claim sits unanswered for a day",
                    ],
                    ["fraudDigest", "Daily fraud digest", "One email listing new signals"],
                  ] as [keyof Config["notify"], string, string][]
                ).map(([key, label, hint]) => (
                  <li key={key} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-800">{label}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
                    </div>
                    <Switch
                      checked={cfg.notify[key]}
                      onChange={(v) => setNotify(key, v)}
                      label={label}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="h-full pb-5">
            <SectionTitle
              title="Connected services"
              hint="Set on the server, never typed into this browser"
              action={
                <Badge tone="ink" dot={false}>
                  <KeyRound className="h-3.5 w-3.5" /> Environment
                </Badge>
              }
            />
            <div className="space-y-4 px-5 pt-5">
              <p className="flex items-start gap-2 rounded-xl bg-[#FFF3DF] px-3.5 py-3 text-xs text-[#8a5a00]">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                GoPasal deliberately has no field for an API key. Each value below is read from the
                server environment, so a secret is never sent to a browser, never stored in the
                database and never visible in this console — only the variable name is.
              </p>

              {INTEGRATIONS.map((sec) => {
                const SIcon = sec.icon;
                return (
                  <div key={sec.group} className="rounded-xl border border-ink-100">
                    <p className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3.5 py-2.5 text-sm font-bold text-ink-900">
                      <SIcon className="h-4 w-4 text-ink-400" /> {sec.group}
                    </p>
                    <ul className="divide-y divide-ink-100">
                      {sec.rows.map((r) => (
                        <li key={r.env} className="px-3.5 py-2.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-ink-800">{r.label}</span>
                            <span className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-[0.68rem] text-ink-600">
                              {r.env}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-500">{r.note}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              <p className="text-xs text-ink-400">
                Copy <span className="font-mono">apps/api/.env.example</span> to{" "}
                <span className="font-mono">apps/api/.env</span> and replace every{" "}
                <span className="font-mono">__REPLACE_ME__</span> with a real key when you are ready
                to go live.
              </p>
            </div>
          </Card>
        </Reveal>
      </div>


      <p className="mt-6 text-xs text-ink-400">
        Signed in as {user?.name ?? user?.phone ?? "an unidentified account"} ·{" "}
        {roleName ?? "no platform role"}. Every change on this page is written to the audit log with
        your name against it.
      </p>

      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setSaved(cfg);
          setConfirm(false);
        }}
        title="Apply these platform settings?"
        description={`Commission becomes ${cfg.commissionPct}%, the default radius ${cfg.deliveryRadiusKm} km, and the cash ceiling ${rs(cfg.codCeiling)}. Every shop is affected from the next order onwards.`}
        confirmLabel="Apply to the platform"
        reasonLabel="Why these settings are changing"
        reasonRequired
      />
    </>
  );
}


