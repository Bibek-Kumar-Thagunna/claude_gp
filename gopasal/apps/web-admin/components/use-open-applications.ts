"use client";

import * as React from "react";
import { useAuth } from "@/components/auth-provider";
import { fetchQueue } from "@/lib/api/onboarding-review";

/**
 * How many onboarding applications are actually waiting on GoPasal.
 *
 * The chrome shows this in two places — the sidebar badge and the notification
 * bell — and it must be the same number in both, read from the same place the
 * Approvals screen reads. `limit: 1` because only `meta.total` is wanted; the
 * server's `OPEN` default already excludes drafts, which nobody has submitted.
 *
 * Returns `null` when the count is unknown: no permission to look, or the call
 * failed. A badge that silently shows 0 in that case would be a lie, so callers
 * should render nothing instead.
 */
export function useOpenApplicationCount(): number | null {
  const { status, hasPermission } = useAuth();
  const [count, setCount] = React.useState<number | null>(null);
  const allowed = status === "authenticated" && hasPermission("shops.view");

  React.useEffect(() => {
    if (!allowed) {
      setCount(null);
      return;
    }
    const controller = new AbortController();
    fetchQueue({ limit: 1, status: "OPEN" }, controller.signal)
      .then((page) => setCount(page.meta.total))
      .catch(() => setCount(null));
    return () => controller.abort();
  }, [allowed]);

  return count;
}
