"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { landingPath, useAuth } from "@/components/auth-provider";
import { ConsoleBoot } from "@/components/states";

/**
 * The entry point decides where this account belongs: the dashboard once a shop
 * is live, the application while it is not, and sign-in when nobody is signed in.
 * It cannot be a server `redirect()` any more, because the answer depends on the
 * session — which lives in the browser.
 */
export default function Home() {
  const router = useRouter();
  const { status, me } = useAuth();

  React.useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && me) router.replace(landingPath(me));
  }, [status, me, router]);

  return <ConsoleBoot label="Opening your seller workspace…" />;
}
