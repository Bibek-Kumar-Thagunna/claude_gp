"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { useAdmin } from "@/components/providers";
import type { PermissionId } from "@/lib/rbac";
import { EmptyState } from "@/components/primitives";

/**
 * Default-deny guard. Renders children only if the current platform role holds
 * `perm`. When denied, shows a clear "no access" state (or nothing, if `silent`).
 *
 * This mirrors the API's @RequirePermissions(...) guard, so the console can never
 * offer an action the backend would reject.
 */
export function PermissionGate({
  perm,
  children,
  silent,
  title = "You don’t have access to this",
  description = "This area needs a permission your platform role doesn’t hold. Ask a Super Admin to grant it.",
}: {
  perm: PermissionId;
  children: React.ReactNode;
  silent?: boolean;
  title?: string;
  description?: string;
}) {
  const { can } = useAdmin();
  if (can(perm)) return <>{children}</>;
  if (silent) return null;
  return <EmptyState icon={<Lock className="h-6 w-6" />} title={title} description={description} />;
}

/** Inline helper: render children only when permitted, with an optional fallback. */
export function Can({
  perm,
  children,
  fallback = null,
}: {
  perm: PermissionId;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useAdmin();
  return can(perm) ? <>{children}</> : <>{fallback}</>;
}

/** Inline helper: render children when ANY of the permissions is held. */
export function CanAny({ perms, children }: { perms: PermissionId[]; children: React.ReactNode }) {
  const { can } = useAdmin();
  return perms.some((p) => can(p)) ? <>{children}</> : null;
}
