"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/primitives";
import { ConsoleBoot, ErrorPanel } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { apiConfigured, NO_API_MESSAGE } from "@gopasal/api-client";

/**
 * Gate for the whole console.
 *
 * This is a convenience, not the security boundary — the API is, and it re-checks
 * the bearer token and the permission on every request no matter what the browser
 * chose to render. What this prevents is the worse experience: an internal console
 * that paints a queue and then empties itself as each call comes back 401 or 403.
 *
 * Two things are checked. First, that there is a session at all. Second — and this
 * is specific to the admin console — that the account has *some* platform standing.
 * A seller who signs in here with the same phone and OTP would otherwise land on a
 * dashboard where every panel fails; telling them plainly that this account has no
 * platform access is both kinder and more honest.
 *
 * `permission` narrows further, for a screen that is meaningless without a specific
 * key. It is checked against the resolved list from `GET /auth/me`, never a local
 * role fixture.
 */
export function RequireAuth({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, me, error, isStaff, hasPermission, signOut, reload } = useAuth();
  const configured = apiConfigured();

  React.useEffect(() => {
    if (!configured) return;
    if (status === "anonymous") router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
  }, [configured, status, router, pathname]);

  if (!configured) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorPanel title="No API configured" message={NO_API_MESSAGE} offline />
      </div>
    );
  }

  if (status === "loading") {
    return <ConsoleBoot label="Restoring your secure session…" />;
  }

  if (status === "anonymous") {
    return <ConsoleBoot label="Taking you to sign in…" />;
  }

  // Signed in, but `/auth/me` did not come back. Without it there is no way to
  // know what this account may do, and on a console that approves shops and
  // moves money, guessing is not an option.
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

  if (me && !isStaff) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorPanel
          title="No platform access"
          message="This account is signed in, but it has no GoPasal platform role, so there is nothing here for it. If you should have access, ask a super admin to add you."
        >
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </ErrorPanel>
      </div>
    );
  }

  if (permission && me && !hasPermission(permission)) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorPanel
          title="Not your permission"
          message="Your platform role does not include this area. Nothing is missing and nothing has failed — this account simply is not allowed here."
        >
          <Button href="/dashboard" variant="outline">
            Back to the dashboard
          </Button>
        </ErrorPanel>
      </div>
    );
  }

  return <>{children}</>;
}
