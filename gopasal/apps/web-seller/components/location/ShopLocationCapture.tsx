"use client";

import * as React from "react";
import Image from "next/image";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Copy,
  Crosshair,
  Loader2,
  MapPin,
  QrCode,
  RefreshCw,
  Share2,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/primitives";
import { InlineError, InlineNotice, InlineWarning } from "@/components/states";
import {
  createLocationCapture,
  readLocationCapture,
  submitCapturedPosition,
  type LocationCaptureMode,
  type LocationCaptureSession,
  type LocationCaptureTarget,
} from "@/lib/api/location-capture";

function locationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was blocked. Allow precise location for this site in your browser settings, then try again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your phone could not get a reliable GPS position. Move near a window or the shop entrance and try again.";
  }
  return "The GPS request took too long. Move near a window or the shop entrance and try again.";
}

function isLocationError(error: unknown): error is GeolocationPositionError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function phonePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location. Open the link in a current phone browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 25_000,
    });
  });
}

export function ShopLocationCapture({
  target,
  current,
  editable,
  problem,
  optional = false,
  onCaptured,
}: {
  target: LocationCaptureTarget;
  current: {
    lat: number | null;
    lng: number | null;
    accuracyM?: number | null;
    capturedAt?: string | null;
  };
  editable: boolean;
  problem?: string | null;
  /** Registration may defer the pin; shop settings may not hide that it blocks discovery. */
  optional?: boolean;
  onCaptured: () => Promise<void>;
}) {
  const [mobile, setMobile] = React.useState<boolean | null>(null);
  const [session, setSession] = React.useState<(LocationCaptureSession & { token?: string }) | null>(null);
  const [link, setLink] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"creating" | "locating" | "copying" | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deferred, setDeferred] = React.useState(false);
  const started = React.useRef(false);
  const notified = React.useRef<string | null>(null);

  React.useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setMobile(coarse || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  }, []);

  const begin = React.useCallback(
    async (mode: LocationCaptureMode) => {
      setBusy("creating");
      setError(null);
      setCopied(false);
      try {
        const created = await createLocationCapture(target, mode);
        const configured = process.env.NEXT_PUBLIC_SELLER_PUBLIC_URL?.trim().replace(/\/+$/, "");
        const url = `${configured || window.location.origin}/location/${encodeURIComponent(created.token)}`;
        setSession(created);
        setLink(url);
        setQr(await QRCode.toDataURL(url, {
          width: 264,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#171923", light: "#FFFFFF" },
        }));
        return created;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not start location capture.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [target],
  );

  // A laptop gets its QR immediately. A phone waits for the seller to choose
  // whether they are physically at the shop or need to hand the link to someone.
  React.useEffect(() => {
    if (!editable || mobile !== false || started.current) return;
    started.current = true;
    void begin("HANDOFF");
  }, [begin, editable, mobile]);

  React.useEffect(() => {
    if (!session || session.status !== "WAITING") return;
    const timer = window.setInterval(() => {
      void readLocationCapture(target, session.captureId)
        .then(async (next) => {
          if (next.status === "EXPIRED") {
            setSession(null);
            setLink(null);
            setQr(null);
            setError("That private link expired. Create a new one when someone is ready at the shop.");
            return;
          }
          setSession((old) => ({ ...next, token: old?.token }));
          if (next.status === "CAPTURED" && notified.current !== next.captureId) {
            notified.current = next.captureId;
            await onCaptured();
          }
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not check the phone."));
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [onCaptured, session, target]);

  async function captureWithThisPhone() {
    let active = session?.token ? session : null;
    if (!active || active.mode !== "DIRECT") active = await begin("DIRECT");
    if (!active?.token) return;
    if (!window.isSecureContext) {
      setError("Phone GPS requires a secure HTTPS page. Open the seller portal over HTTPS, then try again.");
      return;
    }
    setBusy("locating");
    setError(null);
    try {
      const position = await phonePosition();
      const complete = await submitCapturedPosition(active.token, position);
      setSession({ ...complete, token: active.token });
      if (notified.current !== complete.captureId) {
        notified.current = complete.captureId;
        await onCaptured();
      }
    } catch (cause) {
      setError(
        isLocationError(cause)
          ? locationError(cause)
          : cause instanceof Error
            ? cause.message
            : "The location could not be captured.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!link) return;
    setBusy("copying");
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Set the GoPasal shop location",
          text: "Open this while physically inside the shop and share the phone's precise location.",
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("Could not share automatically. Copy the link instead.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!link) return;
    setBusy("copying");
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Could not copy the private link. Use Share link instead.");
    } finally {
      setBusy(null);
    }
  }

  const localOnly = link ? /:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(link) : false;

  function skipForNow() {
    setDeferred(true);
    setSession(null);
    setLink(null);
    setQr(null);
    setError(null);
  }

  function resumeLocation() {
    setDeferred(false);
    if (mobile === false) void begin("HANDOFF");
  }

  if (optional && deferred && current.capturedAt == null) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink-900">Shop location skipped for now</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
              You can submit the registration without it. After approval, add a verified pin in
              Settings and publish an orderable product before customers can discover the shop.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={resumeLocation}>
            <MapPin className="h-4 w-4" /> Add location now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${problem ? "border-red-200 bg-red-50/30" : "border-ink-100 bg-white"}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson-700">
          <MapPin className="h-5 w-5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink-900">Verified shop pin</h3>
            {optional && current.capturedAt == null && (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">
                Optional during registration
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            The phone sharing this location must be physically inside the shop. GoPasal uses the pin for discovery and delivery-distance checks.
          </p>
        </div>
      </div>

      {problem && <InlineWarning message={problem} className="mt-3" />}
      {error && <InlineError message={error} className="mt-3" />}

      {current.lat !== null && current.lng !== null && (
        <InlineNotice
          className="mt-3"
          message={`Pin recorded${current.accuracyM ? ` with ±${Math.round(current.accuracyM)} m accuracy` : ""}.`}
        >
          <p className="mt-1 font-mono text-xs text-ink-600">{current.lat.toFixed(6)}, {current.lng.toFixed(6)}</p>
          {current.capturedAt && <p className="mt-1 text-xs text-ink-500">Captured {new Date(current.capturedAt).toLocaleString("en-GB")}</p>}
        </InlineNotice>
      )}

      {!editable ? null : mobile ? (
        <div className="mt-4 space-y-3">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void captureWithThisPhone()}>
            {busy === "locating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            I am inside the shop — use this phone
          </Button>
          <p className="text-xs text-ink-500">Not at the shop? Create a private link and send it to an owner or worker who is there.</p>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void begin("HANDOFF")}>
            <Share2 className="h-4 w-4" /> Create a link for someone at the shop
          </Button>
        </div>
      ) : mobile === false ? (
        <div className="mt-4 grid items-center gap-5 sm:grid-cols-[auto_1fr]">
          <div className="flex h-[176px] w-[176px] items-center justify-center rounded-2xl border border-ink-100 bg-white p-2 shadow-sm">
            {qr ? <Image src={qr} alt="QR code for secure shop location capture" width={160} height={160} unoptimized className="h-full w-full" /> : <Loader2 className="h-6 w-6 animate-spin text-ink-400" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-800">Scan this QR with a phone inside the shop</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">You may also send the private link to a trusted worker who is currently there. The link expires after 10 minutes and a newer link cancels the old one.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!link || busy !== null} onClick={() => void share()}>
                <Share2 className="h-4 w-4" /> Share link
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={!link || busy !== null} onClick={() => void copyLink()}>
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void begin("HANDOFF")}>
                <RefreshCw className="h-4 w-4" /> New code
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {mobile && session?.mode === "HANDOFF" && link && (
        <div className="mt-4 rounded-xl bg-ink-50 p-3">
          <p className="text-xs font-semibold text-ink-700">Private 10-minute link ready</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void share()}>
            <Share2 className="h-4 w-4" /> Send to the person at the shop
          </Button>
        </div>
      )}

      {session?.status === "WAITING" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-500"><Smartphone className="h-3.5 w-3.5" /> Waiting for the phone at the shop…</p>
      )}
      {session?.status === "CAPTURED" && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Location received and saved.</p>
      )}
      {optional && editable && current.capturedAt == null && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={skipForNow}>
            Skip for now
          </Button>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
            This will not block registration. The approved shop stays private until the pin and an orderable product are added.
          </p>
        </div>
      )}
      {localOnly && (
        <InlineWarning className="mt-3" message="A phone cannot open a localhost QR code.">
          <p className="mt-1 text-xs">For local testing, expose the seller site through HTTPS and set NEXT_PUBLIC_SELLER_PUBLIC_URL to that address. Phone browsers require HTTPS for precise GPS.</p>
        </InlineWarning>
      )}
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-ink-400">
        <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Browser GPS proves what the phone reported, but no web flow can prevent GPS spoofing. GoPasal keeps the accuracy and capture time for review.
      </p>
    </div>
  );
}
