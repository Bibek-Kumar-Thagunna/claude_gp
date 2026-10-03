"use client";

/* eslint-disable @next/next/no-img-element -- authenticated proof blobs cannot use the Next image optimizer */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@gopasal/ui";
import { ApiError } from "@gopasal/api-client";
import {
  Bike,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import {
  riderApi,
  type DeliveryStatus,
  type RiderDelivery,
  type RiderProfile,
} from "@/lib/api/rider";

type GeoState = "idle" | "starting" | "sharing" | "denied" | "unsupported" | "error";

export function RiderDashboard() {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = React.useState<RiderProfile | null>(null);
  const [active, setActive] = React.useState<RiderDelivery[]>([]);
  const [history, setHistory] = React.useState<RiderDelivery[]>([]);
  const [tab, setTab] = React.useState<"active" | "history">("active");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [geo, setGeo] = React.useState<GeoState>("idle");
  const [lastShared, setLastShared] = React.useState<{ at: Date; accuracy?: number } | null>(null);
  const [online, setOnline] = React.useState(true);
  const watchId = React.useRef<number | null>(null);
  const lastPingAt = React.useRef(0);

  React.useEffect(() => {
    setOnline(window.navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const load = React.useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const [nextProfile, nextActive, nextHistory] = await Promise.all([
          riderApi.profile(),
          riderApi.active(),
          riderApi.history(),
        ]);
        setProfile(nextProfile);
        setActive(nextActive);
        setHistory(nextHistory.data);
      } catch (cause) {
        if (cause instanceof ApiError && cause.isAuth) {
          await auth.signOut();
          router.replace("/login");
          return;
        }
        setError(cause instanceof ApiError ? cause.message : "Could not load your deliveries.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [auth, router],
  );

  React.useEffect(() => {
    if (auth.status === "anonymous") router.replace("/login");
    if (auth.status === "authenticated") void load();
  }, [auth.status, load, router]);

  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [auth.status, load]);

  const stopSharing = React.useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setGeo("idle");
  }, []);
  React.useEffect(() => stopSharing, [stopSharing]);

  function startSharing() {
    if (!("geolocation" in navigator)) {
      setGeo("unsupported");
      return;
    }
    setGeo("starting");
    setError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setGeo("sharing");
        const now = Date.now();
        if (now - lastPingAt.current < 8_000) return;
        lastPingAt.current = now;
        const coords = position.coords;
        void riderApi
          .ping({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading ?? undefined,
            speed: coords.speed ?? undefined,
          })
          .then(() => setLastShared({ at: new Date(), accuracy: coords.accuracy }))
          .catch((cause: unknown) =>
            setError(
              cause instanceof ApiError ? cause.message : "Your position could not be shared.",
            ),
          );
      },
      (cause) => setGeo(cause.code === cause.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
  }

  async function changeAvailability(status: "ONLINE" | "OFFLINE") {
    setRefreshing(true);
    setError(null);
    try {
      await riderApi.status(status);
      await load(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Availability could not be updated.");
      setRefreshing(false);
    }
  }

  if (auth.status === "loading" || loading) return <LoadingScreen />;

  return (
    <main id="main" className="pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="rider-shell flex h-16 items-center justify-between">
          <Logo variant="full" height={27} />
          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold sm:flex ${online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
            >
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online ? "Connected" : "Offline"}
            </span>
            <button
              onClick={() => void load(true)}
              aria-label="Refresh deliveries"
              className="rounded-xl border p-2.5 text-ink-600"
            >
              <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => void auth.signOut().then(() => router.replace("/login"))}
              aria-label="Sign out"
              className="rounded-xl border p-2.5 text-ink-600"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="rider-shell py-6 sm:py-8">
        <section className="rider-card overflow-hidden">
          <div className="bg-gradient-to-br from-crimson-700 to-crimson-900 p-5 text-white sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-white/70">Welcome back</p>
                <h1 className="mt-1 text-2xl font-bold text-white">
                  {profile?.user.name || "GoPasal rider"}
                </h1>
                <p className="mt-2 flex items-center gap-2 text-sm text-white/80">
                  <Store className="h-4 w-4" /> {profile?.shop?.name ?? "Shop assignment pending"}
                </p>
              </div>
              <span className="rounded-2xl bg-white/12 p-3">
                <Bike className="h-6 w-6" />
              </span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                disabled={profile?.status === "ON_DELIVERY" || refreshing}
                onClick={() => void changeAvailability("ONLINE")}
                className={`rider-button ${profile?.status !== "OFFLINE" ? "bg-white text-crimson-700" : "bg-white/10 text-white ring-1 ring-white/20"}`}
              >
                <Wifi className="h-4 w-4" /> Online
              </button>
              <button
                disabled={profile?.status === "ON_DELIVERY" || refreshing}
                onClick={() => void changeAvailability("OFFLINE")}
                className={`rider-button ${profile?.status === "OFFLINE" ? "bg-white text-crimson-700" : "bg-white/10 text-white ring-1 ring-white/20"}`}
              >
                <WifiOff className="h-4 w-4" /> Offline
              </button>
            </div>
            {profile?.status === "ON_DELIVERY" && (
              <p className="mt-3 text-xs text-white/70">
                Availability is managed automatically until your active delivery finishes.
              </p>
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {active.length > 0 && (
          <LocationControl
            state={geo}
            lastShared={lastShared}
            onStart={startSharing}
            onStop={stopSharing}
          />
        )}

        <div
          className="mt-6 flex rounded-xl bg-ink-100 p-1"
          role="tablist"
          aria-label="Delivery list"
        >
          <button
            role="tab"
            aria-selected={tab === "active"}
            onClick={() => setTab("active")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${tab === "active" ? "bg-white text-crimson-700 shadow-sm" : "text-ink-500"}`}
          >
            <Route className="h-4 w-4" /> Active{" "}
            <span className="rounded-full bg-crimson-50 px-2 py-0.5 text-xs text-crimson-700">
              {active.length}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${tab === "history" ? "bg-white text-crimson-700 shadow-sm" : "text-ink-500"}`}
          >
            <History className="h-4 w-4" /> History
          </button>
        </div>

        <section className="mt-4 space-y-4">
          {tab === "active" ? (
            active.length ? (
              active.map((delivery) => (
                <DeliveryCard
                  key={delivery.id}
                  delivery={delivery}
                  onChanged={() => load(true)}
                  onError={setError}
                />
              ))
            ) : (
              <EmptyState
                title="No active delivery"
                body={
                  profile?.status === "OFFLINE"
                    ? "Go online when you are ready to receive a delivery assignment."
                    : "New assignments from your shop will appear here automatically."
                }
              />
            )
          ) : history.length ? (
            history.map((delivery) => <HistoryCard key={delivery.id} delivery={delivery} />)
          ) : (
            <EmptyState
              title="No completed deliveries yet"
              body="Delivered and unsuccessful attempts will be recorded here."
            />
          )}
        </section>
      </div>
    </main>
  );
}

function LocationControl({
  state,
  lastShared,
  onStart,
  onStop,
}: {
  state: GeoState;
  lastShared: { at: Date; accuracy?: number } | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const sharing = state === "sharing" || state === "starting";
  return (
    <section className="rider-card mt-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className={`rounded-xl p-2.5 ${sharing ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
        >
          <LocateFixed className={`h-5 w-5 ${state === "starting" ? "animate-pulse" : ""}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Live location</h2>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                Shared only while this page is open and you choose to keep it on.
              </p>
            </div>
            <button
              onClick={sharing ? onStop : onStart}
              className={`rider-button min-h-10 px-3 py-2 text-sm ${sharing ? "rider-secondary" : "rider-primary"}`}
            >
              {sharing ? "Stop" : "Share"}
            </button>
          </div>
          {lastShared && (
            <p className="mt-3 text-xs font-medium text-emerald-700">
              Last shared{" "}
              {lastShared.at.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              {lastShared.accuracy ? ` · ±${Math.round(lastShared.accuracy)} m` : ""}
            </p>
          )}
          {state === "denied" && (
            <p className="mt-3 text-xs text-red-700">
              Location permission was denied. Enable it in your browser settings to share your real
              position.
            </p>
          )}
          {state === "unsupported" && (
            <p className="mt-3 text-xs text-red-700">
              This browser does not support location sharing.
            </p>
          )}
          {state === "error" && (
            <p className="mt-3 text-xs text-red-700">
              A reliable GPS position could not be obtained. Move to an open area and try again.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function DeliveryCard({
  delivery,
  onChanged,
  onError,
}: {
  delivery: RiderDelivery;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [finish, setFinish] = React.useState(false);
  const [reportingFailure, setReportingFailure] = React.useState(false);
  const order = delivery.order;
  const returning = delivery.status === "RETURNING_TO_SHOP";
  const needsReturn = delivery.status === "FAILED" && delivery.pickedUpAt !== null;
  const destinationLat = returning ? order.shop.lat : (delivery.destLat ?? order.lat);
  const destinationLng = returning ? order.shop.lng : (delivery.destLng ?? order.lng);
  const destination =
    destinationLat !== null && destinationLng !== null
      ? `${destinationLat},${destinationLng}`
      : null;
  const destinationLabel = returning ? `Navigate to ${order.shop.name}` : "Navigate to customer";

  async function transition(status: DeliveryStatus, body: Record<string, unknown> = {}) {
    setBusy(true);
    onError(null);
    try {
      await riderApi.transition(delivery.orderId, { status, ...body });
      await onChanged();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "The delivery could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rider-card overflow-hidden">
      <button
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
      >
        <span className="rounded-xl bg-crimson-50 p-2.5 text-crimson-700">
          <PackageCheck className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wider text-crimson-600">
            {statusLabel(delivery.status)}
          </span>
          <span className="mt-1 block text-lg font-bold">{order.code}</span>
          <span className="block truncate text-sm text-ink-500">
            {order.recipientName} · {order.area}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 text-ink-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t px-4 pb-5 pt-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBox
              icon={Store}
              label="Pickup"
              value={order.shop.name}
              detail={order.shop.fullAddress || order.shop.area || "Address not supplied"}
            />
            <InfoBox
              icon={MapPin}
              label="Deliver to"
              value={order.recipientName}
              detail={[order.fullAddress, order.landmark ? `Near ${order.landmark}` : null]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a href={`tel:${order.recipientPhone}`} className="rider-button rider-secondary">
              <Phone className="h-4 w-4" /> Call customer
            </a>
            {destination ? (
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
                className="rider-button rider-secondary"
              >
                <Navigation className="h-4 w-4" /> {destinationLabel}{" "}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button disabled className="rider-button rider-secondary">
                <Navigation className="h-4 w-4" /> No verified pin
              </button>
            )}
            {order.shop.phone && (
              <a
                href={`tel:${order.shop.phone}`}
                className="rider-button rider-secondary col-span-2"
              >
                <Store className="h-4 w-4" /> Call {order.shop.name}
              </a>
            )}
          </div>
          <div className="mt-4 rounded-xl bg-ink-50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">
                {order.items.reduce((sum, item) => sum + item.qty, 0)} items
              </h3>
              <span className="font-bold">रु {order.total.toLocaleString("en-IN")}</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    {item.qty} × {item.nameSnapshot}
                    <span className="text-ink-400"> {item.unitSnapshot}</span>
                  </span>
                  <span>रु {(item.price * item.qty).toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
            {order.note && (
              <p className="mt-3 border-t pt-3 text-sm">
                <strong>Customer note:</strong> {order.note}
              </p>
            )}
          </div>
          <div
            className={`mt-4 flex items-start gap-3 rounded-xl p-4 ${order.paymentMethod === "COD" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
          >
            <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">
                {order.paymentMethod === "COD"
                  ? `Collect रु ${order.total.toLocaleString("en-IN")} in cash`
                  : "Paid online"}
              </p>
              <p className="mt-1 text-xs opacity-75">
                {order.paymentMethod === "COD"
                  ? "Confirm only after counting the cash at handover."
                  : "Do not collect any cash from the customer."}
              </p>
            </div>
          </div>
          <div className="mt-4">
            {delivery.status === "ASSIGNED" && !reportingFailure && (
              <button
                disabled={busy}
                onClick={() => void transition("PICKED_UP")}
                className="rider-button rider-primary w-full"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PackageCheck className="h-5 w-5" />
                )}{" "}
                Confirm pickup
              </button>
            )}
            {delivery.status === "PICKED_UP" && !reportingFailure && (
              <button
                disabled={busy}
                onClick={() => void transition("EN_ROUTE")}
                className="rider-button rider-primary w-full"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Navigation className="h-5 w-5" />
                )}{" "}
                Start delivery
              </button>
            )}
            {delivery.status === "EN_ROUTE" && !finish && !reportingFailure && (
              <button onClick={() => setFinish(true)} className="rider-button rider-primary w-full">
                <CheckCircle2 className="h-5 w-5" /> Complete handover
              </button>
            )}
            {needsReturn && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold text-amber-950">The parcel is still in your custody</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Return it to {order.shop.name}. The shop must inspect and confirm receipt before
                  this delivery closes.
                </p>
                <button
                  disabled={busy}
                  onClick={() => void transition("RETURNING_TO_SHOP")}
                  className="rider-button rider-primary mt-3 w-full"
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Store className="h-5 w-5" />
                  )}{" "}
                  Start return to shop
                </button>
              </div>
            )}
            {returning && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="font-bold text-blue-950">Return the parcel to {order.shop.name}</p>
                <p className="mt-1 text-xs leading-5 text-blue-800">
                  Keep the parcel secure. After handover, the shop will record its condition and
                  release you from this delivery.
                </p>
              </div>
            )}
            {finish && (
              <CompletionForm
                delivery={delivery}
                busy={busy}
                onCancel={() => setFinish(false)}
                onComplete={(body) => transition("DELIVERED", body)}
                onUploaded={onChanged}
                onError={onError}
              />
            )}
            {!finish && !reportingFailure && !needsReturn && !returning && (
              <button
                disabled={busy}
                onClick={() => setReportingFailure(true)}
                className="mt-3 w-full py-2 text-sm font-bold text-red-700"
              >
                Report delivery problem
              </button>
            )}
            {reportingFailure && (
              <FailureForm
                busy={busy}
                onCancel={() => setReportingFailure(false)}
                onConfirm={(reason) => transition("FAILED", { failReason: reason })}
              />
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function FailureForm({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const valid = reason.trim().length >= 3;
  return (
    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4">
      <h3 className="font-bold text-red-900">What prevented this delivery?</h3>
      <p className="mt-1 text-xs leading-5 text-red-800">
        Use a factual reason. The shop and support team will see it and can decide the next step.
      </p>
      <label className="mt-3 block text-sm font-semibold text-red-900">
        Reason <span className="text-red-700">*</span>
        <textarea
          autoFocus
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Customer asked to reschedule; phone confirmed"
          className="mt-2 w-full rounded-xl border border-red-200 bg-white p-3 font-normal text-ink-900 outline-none focus:border-red-400"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="rider-button rider-secondary">
          Continue delivery
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => void onConfirm(reason.trim())}
          className="rider-button bg-red-700 text-white"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TriangleAlert className="h-4 w-4" />
          )}{" "}
          Record failure
        </button>
      </div>
    </div>
  );
}

function CompletionForm({
  delivery,
  busy,
  onCancel,
  onComplete,
  onUploaded,
  onError,
}: {
  delivery: RiderDelivery;
  busy: boolean;
  onCancel: () => void;
  onComplete: (body: Record<string, unknown>) => Promise<void>;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [note, setNote] = React.useState("");
  const [cash, setCash] = React.useState(false);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploaded, setUploaded] = React.useState(delivery.hasProofPhoto);
  const cod = delivery.order.paymentMethod === "COD";

  async function upload() {
    if (!photo) return;
    setUploading(true);
    onError(null);
    try {
      await riderApi.uploadProof(delivery.orderId, photo);
      setUploaded(true);
      await onUploaded();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "The proof photo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const valid = note.trim().length >= 3 && (!cod || cash);
  return (
    <div className="rounded-2xl border border-crimson-100 bg-crimson-50/40 p-4">
      <h3 className="font-bold">Confirm the doorstep handover</h3>
      <p className="mt-1 text-xs leading-5 text-ink-500">
        Add a useful note. A proof photo is stored privately and is recommended when the customer
        consents.
      </p>
      <label className="mt-4 block text-sm font-semibold">
        Handover note <span className="text-red-600">*</span>
        <textarea
          maxLength={500}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Handed to recipient at the front desk"
          className="mt-2 w-full rounded-xl border bg-white p-3 font-normal outline-none focus:border-crimson-400"
        />
      </label>
      <div className="mt-3 rounded-xl border bg-white p-3">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <Camera className="h-5 w-5 text-crimson-600" />
          <span className="min-w-0 flex-1 truncate">
            {photo?.name ?? (uploaded ? "Proof photo securely uploaded" : "Choose proof photo")}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              setPhoto(event.target.files?.[0] ?? null);
              setUploaded(false);
            }}
          />
        </label>
        {photo && !uploaded && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => void upload()}
            className="rider-button rider-secondary mt-3 w-full min-h-10 text-sm"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}{" "}
            Upload privately
          </button>
        )}
      </div>
      {cod && (
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={cash}
            onChange={(event) => setCash(event.target.checked)}
            className="mt-1 h-4 w-4 accent-crimson-600"
          />
          <span>
            <strong>I collected रु {delivery.order.total.toLocaleString("en-IN")} in cash.</strong>
            <span className="mt-1 block text-xs text-amber-800">
              This becomes a settlement record and cannot be casually undone.
            </span>
          </span>
        </label>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="rider-button rider-secondary">
          Not yet
        </button>
        <button
          type="button"
          disabled={!valid || busy || uploading}
          onClick={() =>
            void onComplete({ podNote: note.trim(), codCollected: cod ? true : undefined })
          }
          className="rider-button rider-primary"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}{" "}
          Confirm
        </button>
      </div>
    </div>
  );
}

function HistoryCard({ delivery }: { delivery: RiderDelivery }) {
  const success = delivery.status === "DELIVERED";
  const returned = delivery.status === "RETURNED_TO_SHOP";
  const tone = success
    ? "bg-emerald-50 text-emerald-700"
    : returned
      ? "bg-amber-50 text-amber-800"
      : "bg-red-50 text-red-700";
  const label = success ? "Delivered" : returned ? "Returned to shop" : "Failed before pickup";
  return (
    <article className="rider-card flex items-start gap-3 p-4 sm:p-5">
      <span className={`rounded-xl p-2.5 ${tone}`}>
        {success ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : returned ? (
          <Store className="h-5 w-5" />
        ) : (
          <TriangleAlert className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{delivery.order.code}</p>
            <p className="mt-1 truncate text-sm text-ink-500">
              {delivery.order.recipientName} · {delivery.order.area}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />{" "}
            {new Date(
              delivery.deliveredAt ??
                delivery.returnedAt ??
                delivery.failedAt ??
                delivery.updatedAt,
            ).toLocaleString()}
          </span>
          <span>रु {delivery.order.total.toLocaleString("en-IN")}</span>
        </div>
        {delivery.podNote && <p className="mt-3 text-sm text-ink-600">{delivery.podNote}</p>}
        {delivery.hasProofPhoto && <RiderProofPhoto orderId={delivery.orderId} />}
        {delivery.failReason && (
          <p className="mt-3 text-sm text-red-700">Delivery issue: {delivery.failReason}</p>
        )}
        {delivery.returnNote && (
          <p className="mt-2 text-sm text-amber-900">Shop receipt: {delivery.returnNote}</p>
        )}
      </div>
    </article>
  );
}

function RiderProofPhoto({ orderId }: { orderId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await riderApi.proof(orderId);
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The proof photo could not be opened.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3">
      {url ? (
        <img
          src={url}
          alt="Private delivery handover evidence"
          className="max-h-72 w-full rounded-xl border bg-white object-contain"
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void open()}
          className="rider-button rider-secondary min-h-10 text-sm"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{" "}
          {busy ? "Opening securely…" : "View private proof"}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function InfoBox({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-crimson-600" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</p>
          <p className="mt-1 font-bold">{value}</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rider-card px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        <Route className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-500">{body}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center">
      <div className="text-center">
        <Logo variant="full" height={29} />
        <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-crimson-600" />
        <p className="mt-3 text-sm text-ink-500">Loading your delivery desk…</p>
      </div>
    </main>
  );
}

function statusLabel(status: RiderDelivery["status"]) {
  return (
    {
      ASSIGNED: "Ready for pickup",
      PICKED_UP: "Picked up",
      EN_ROUTE: "On the way",
      DELIVERED: "Delivered",
      FAILED: "Delivery failed",
      RETURNING_TO_SHOP: "Returning to shop",
      RETURNED_TO_SHOP: "Returned to shop",
    } as const
  )[status];
}
