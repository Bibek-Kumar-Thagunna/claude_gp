import * as React from "react";
import { useRiderJobs, useRiderProfile } from "@gopasal/native-data/rider";
import { useT } from "@gopasal/native-ui";
import { useTracking, type TrackingState } from "./tracking";

/**
 * One location tracker for the whole signed-in app.
 *
 * Mounted by the tabs layout, which stays mounted underneath every pushed
 * screen — so sharing carries on while a rider is on a job's detail page, and
 * there is never a second watch fighting the first.
 */
const Ctx = React.createContext<{ state: TrackingState; refresh: () => void }>({
  state: { kind: "off" },
  refresh: () => undefined,
});

export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const profile = useRiderProfile();
  // Only once the server has said this is a rider: a customer who installed
  // the wrong app has no jobs to ask for, and asking just earns a 404.
  const jobs = useRiderJobs({ poll: true, enabled: Boolean(profile.data) });
  const status = profile.data?.status ?? "OFFLINE";
  const onJob = (jobs.data ?? []).length > 0;
  const value = useTracking({
    online: status !== "OFFLINE",
    onJob,
    serviceTitle: t("tracking.service.title"),
    serviceBody: t("tracking.service.body"),
  });
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrackingState() {
  return React.useContext(Ctx);
}
