"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives";
import { ErrorPanel, LoadingPanel } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { apiConfigured, NO_API_MESSAGE } from "@gopasal/api-client";

/**
 * Gate for anything behind sign-in.
 *
 * This is a convenience, not the security boundary — the API is, and it checks
 * every request against the bearer token regardless of what the browser chooses
 * to render. What this component prevents is the worse experience: a dashboard
 * that paints, then empties itself as each call comes back 401.
 *
 * `requireLiveShop` additionally redirects an account with no active shop into
 * onboarding, which is the only screen that can explain why the dashboard is not
 * available to them yet.
 */
export function RequireAuth({
  children,
  requireLiveShop = false,
}: {
  children: React.ReactNode;
  requireLiveShop?: boolean;
}) {
  const router = useRouter();
  const { status, me, error, hasLiveShop, reload } = useAuth();
  const configured = apiConfigured();

  React.useEffect(() => {
    if (!configured) return;
    if (status === "anonymous") router.replace("/login");
  }, [configured, status, router]);

  React.useEffect(() => {
    if (!requireLiveShop) return;
    if (status !== "authenticated" || !me) return;
    if (!hasLiveShop) router.replace("/onboarding");
  }, [requireLiveShop, status, me, hasLiveShop, router]);

  if (!configured) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorPanel title="No API configured" message={NO_API_MESSAGE} offline />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-xl py-16">
        <LoadingPanel label="Checking your session…" />
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <div className="mx-auto max-w-xl py-16">
        <LoadingPanel label="Taking you to sign in…" />
      </div>
    );
  }

  // Signed in, but `/auth/me` did not come back. Without it there is no way to
  // know what this account may do, so guessing would be worse than waiting.
  if (error && !me) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorPanel
          title="Could not load your account"
          message={error.message}
          offline={error.offline}
          onRetry={() => void reload()}
        />
      </div>
    );
  }

  if (requireLiveShop && me && !hasLiveShop) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorPanel
          title="No shop yet"
          message="This account does not have a live shop on GoPasal, so there is no dashboard to show. Your application is where to pick things up."
        >
          <Button href="/onboarding">Go to my application</Button>
        </ErrorPanel>
      </div>
    );
  }

  return <>{children}</>;
}
