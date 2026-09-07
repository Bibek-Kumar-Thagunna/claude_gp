"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { useSeller } from "@/components/providers";
import type { PermissionId } from "@/lib/rbac";
import { EmptyState } from "@/components/primitives";

/**
 * Default-deny guard for a whole screen.
 *
 * `can` comes from `useSeller()`, which resolves it against the permission list
 * `GET /auth/me` returned for the shop currently in scope — not against any
 * local role. This is a convenience, not the security boundary: the API checks
 * the same dotted key on every request. What it prevents is the worse
 * experience, a screen that paints and then refuses.
 *
 * `RequireAuth` wraps the whole `(app)` group, so by the time this renders
 * `/auth/me` has already been read; a denial here means a real denial, not a
 * list that has not arrived yet.
 */
export function PermissionGate({
  perm,
  children,
  title = "You don’t have access to this",
  description = "Ask your shop owner to grant the required permission for your role.",
}: {
  perm: PermissionId;
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { can } = useSeller();
  if (can(perm)) return <>{children}</>;
  return (
    <EmptyState
      icon={<Lock className="h-6 w-6" />}
      title={title}
      description={description}
    />
  );
}

/*
 * Two things used to live alongside the gate and neither had a caller.
 *
 * A `silent` prop rendered `null` instead of the explanation. Every one of the
 * twelve screens that gates itself passes only `perm`, because a whole page vanishing
 * without a word is the one denial a seller cannot act on — they cannot ask their
 * owner for a permission they were never told they lacked.
 *
 * A `Can` component wrapped a single button the same way. Screens guard buttons
 * with the shop-scoped check instead — `canInShop(order.shopId, "orders.cancel")`
 * — and that is not a style difference: `useSeller().can` resolves against the
 * shop *in scope*, which on the consolidated view (`activeShopId === null`) is a
 * union across every shop. Wrapping a per-row action in `Can` would therefore have
 * offered shop B's button because shop A granted the key. The gate is safe for a
 * whole screen, where the union is the honest question, and wrong for one row.
 */
