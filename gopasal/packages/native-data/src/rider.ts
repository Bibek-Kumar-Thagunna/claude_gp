/**
 * The rider app's data layer: profile, availability, jobs, history, the
 * status steps, the proof photo, and GPS pings.
 *
 * Everything is `/rider/*`, scoped by the signed-in user on the server — there
 * is no rider id in any path, so there is nothing a screen could get wrong
 * about whose jobs it is showing.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paginated } from "@gopasal/api-client/types";
import { useGopasal } from "./GopasalProvider";
import { ApiError, createHttp, type Http } from "./http";
import { createSessionStore } from "./session";
import { appendFilePart, type FilePart } from "./file-part";
import { usePaged } from "./paged";
import {
  riderQk,
  riderStep,
  riderTransitionBody,
  type RiderDelivery,
  type RiderProfile,
  type RiderTransition,
} from "./rider-wire";

export * from "./rider-wire";

/**
 * Who the signed-in person is as a rider.
 *
 * A 404 is an answer, not an error: "You are not registered as a rider" is
 * what a customer or shopkeeper who installed the wrong app gets, and the gate
 * shows them a screen that says so rather than a spinner.
 */
export function useRiderProfile() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: riderQk.me(),
    enabled: Boolean(user),
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<RiderProfile | null> => {
      try {
        return await http.request<RiderProfile>("/rider/me");
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) return null;
        throw cause;
      }
    },
  });
}

/**
 * The jobs in hand: assigned, picked up, on the way, and a failed parcel still
 * being carried. Polled while the screen watching it is open — an assignment
 * made at the counter has to reach a rider standing outside it.
 */
export function useRiderJobs(options?: { poll?: boolean; enabled?: boolean }) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: riderQk.active(),
    enabled: Boolean(user) && options?.enabled !== false,
    staleTime: 5_000,
    refetchInterval: options?.poll ? 12_000 : false,
    refetchIntervalInBackground: false,
    queryFn: () => http.request<RiderDelivery[]>("/rider/deliveries"),
  });
}

/** One job, from the active list — there is no single-job route for riders. */
export function useRiderJob(orderId: string | null | undefined) {
  const jobs = useRiderJobs({ poll: true });
  const job = React.useMemo(
    () => (jobs.data ?? []).find((d) => d.orderId === orderId) ?? null,
    [jobs.data, orderId],
  );
  return { ...jobs, job };
}

/** Delivered, failed and returned jobs, newest first, paged to the end. */
export function useRiderHistory() {
  const { http, user } = useGopasal();
  return usePaged<RiderDelivery, Paginated<RiderDelivery>>({
    enabled: Boolean(user),
    staleTime: 30_000,
    key: (page) => riderQk.history(page),
    fetch: (page) =>
      http.request<Paginated<RiderDelivery>>(`/rider/deliveries/history?page=${page}&limit=20`),
    resetOn: "history",
  });
}

/**
 * Go online or offline. The server refuses OFFLINE while a job is in hand
 * ("Finish your active delivery before going offline") and never accepts
 * ON_DELIVERY from here — it sets that itself on assignment.
 */
export function useRiderAvailability() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "ONLINE" | "OFFLINE") =>
      http.request<RiderProfile>("/rider/status", { method: "PATCH", body: { status } }),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: riderQk.me() });
      const previous = qc.getQueryData<RiderProfile | null>(riderQk.me());
      if (previous) qc.setQueryData(riderQk.me(), { ...previous, status });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(riderQk.me(), ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: riderQk.me() }),
  });
}

/** Move a job one step. Refetches jobs, history and the profile (status follows). */
export function useRiderStep() {
  const { http } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string; transition: RiderTransition }) =>
      http.request<RiderDelivery>(`/rider/orders/${encodeURIComponent(input.orderId)}/delivery`, {
        method: "PATCH",
        body: riderTransitionBody(input.transition),
      }),
    onSuccess: (updated) => {
      // A finished job leaves the list at once rather than lingering, merged
      // and marked delivered, until the refetch lands — the list is persisted,
      // and a stale "1 in hand" is what stops a rider going offline.
      qc.setQueryData<RiderDelivery[]>(riderQk.active(), (rows) =>
        rows
          ?.map((r) => (r.orderId === updated.orderId ? { ...r, ...updated, order: r.order } : r))
          .filter((r) => r.orderId !== updated.orderId || riderStep(r).stage !== "done"),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: riderQk.active() });
      void qc.invalidateQueries({ queryKey: riderQk.historyRoot() });
      void qc.invalidateQueries({ queryKey: riderQk.me() });
    },
  });
}

/**
 * Attach the doorstep photo. Private on the server — the key never comes back —
 * and allowed only between pickup and handover.
 */
export function useProofUpload() {
  const { http, session } = useGopasal();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; file: FilePart }) => {
      const stored = session.get();
      if (stored && stored.accessExpiresAt - 30_000 <= Date.now()) await http.refreshSession();
      const token = session.get()?.accessToken;
      const form = new FormData();
      await appendFilePart(form, "file", input.file);
      let res: Response;
      try {
        res = await fetch(
          `${http.root()}/rider/orders/${encodeURIComponent(input.orderId)}/proof`,
          {
            method: "POST",
            headers: token ? { authorization: `Bearer ${token}` } : {},
            body: form,
            signal: AbortSignal.timeout(90_000),
          },
        );
      } catch {
        throw new ApiError(0, "Couldn't send the photo. Check the connection and try again.");
      }
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!res.ok) {
        const message =
          body && typeof body === "object" && "message" in body
            ? String((body as { message: unknown }).message)
            : `Upload failed (${res.status})`;
        throw new ApiError(res.status, message, body);
      }
      return body as { uploaded: true; mimeType: string; size: number };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: riderQk.active() }),
  });
}

/** Where the rider is. Fire-and-forget; the server throttles and keeps the latest. */
export async function sendPing(
  http: Http,
  fix: { lat: number; lng: number; heading?: number | null; speed?: number | null; accuracy?: number | null },
): Promise<void> {
  const body: Record<string, number> = { lat: fix.lat, lng: fix.lng };
  if (fix.heading != null && fix.heading >= 0) body.heading = fix.heading;
  if (fix.speed != null && fix.speed >= 0) body.speed = fix.speed;
  if (fix.accuracy != null && fix.accuracy >= 0) body.accuracy = fix.accuracy;
  await http.request("/rider/ping", { method: "POST", body });
}

/**
 * A client for code that runs outside React — the background location task,
 * which the OS wakes with the app closed. It reads the same stored session the
 * app does, refreshes it when needed, and writes the refreshed tokens back so
 * the app finds them when it opens.
 */
export async function createBackgroundClient(origin: string): Promise<Http | null> {
  const session = createSessionStore();
  await session.restore();
  if (!session.get()) return null;
  return createHttp({
    origin,
    getSession: () => session.get(),
    setSession: (next) => session.set(next),
    onSignOut: () => void session.clear(),
  });
}
