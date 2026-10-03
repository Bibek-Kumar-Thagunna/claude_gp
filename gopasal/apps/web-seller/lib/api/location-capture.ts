import { ApiError } from "@gopasal/api-client";
import { authedRequest } from "./client";

export type LocationCaptureMode = "DIRECT" | "HANDOFF";
export type LocationCaptureStatus = "WAITING" | "CAPTURED" | "EXPIRED";

export type LocationCaptureSession = {
  captureId: string;
  token?: string;
  status: LocationCaptureStatus;
  mode: LocationCaptureMode;
  expiresAt: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  capturedAt: string | null;
};

export type LocationCaptureTarget =
  | { kind: "application"; id: string }
  | { kind: "shop"; id: string };

function base(target: LocationCaptureTarget): string {
  return target.kind === "application"
    ? `/seller/onboarding/applications/${encodeURIComponent(target.id)}/location-captures`
    : `/seller/shops/${encodeURIComponent(target.id)}/location-captures`;
}

export function createLocationCapture(
  target: LocationCaptureTarget,
  mode: LocationCaptureMode,
): Promise<LocationCaptureSession & { token: string }> {
  return authedRequest<LocationCaptureSession & { token: string }>(base(target), {
    method: "POST",
    body: { mode },
  });
}

export function readLocationCapture(
  target: LocationCaptureTarget,
  captureId: string,
): Promise<LocationCaptureSession | { status: "EXPIRED" }> {
  return authedRequest(`${base(target)}/${encodeURIComponent(captureId)}`);
}

export async function submitCapturedPosition(
  token: string,
  position: GeolocationPosition,
): Promise<LocationCaptureSession> {
  const response = await fetch(`/api/location-captures/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString(),
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | (LocationCaptureSession & { message?: string })
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      kind: "LocationCaptureError",
      message: body?.message ?? "The shop location could not be recorded.",
    });
  }
  return body as LocationCaptureSession;
}
