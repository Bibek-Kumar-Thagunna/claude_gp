"use client";

/**
 * "Which shops may this screen read?" — and the four different answers to it.
 *
 * Every shop-scoped screen used to compute one thing:
 *
 * ```ts
 * const readableShopIds = scopedShopIds.filter((id) => canInShop(id, "catalog.view"));
 * ```
 *
 * and then treat `readableShopIds.length === 0` as a single case, worded as a
 * missing permission. It is four cases, and three of them are not that:
 *
 * 1. `GET /seller/shops` is still in flight — nothing is known yet.
 * 2. It **failed**. `ShopProvider` records the `ApiError`, and a screen that
 *    ignores it tells the seller they lack a permission the server never got the
 *    chance to report. This is the case that was actually wrong: a dropped
 *    connection read as "ask an owner for access".
 * 3. It succeeded and the account holds no shop at all.
 * 4. It succeeded, shops exist, and none of them grants this permission — the only
 *    case where "ask an owner" is true.
 *
 * {@link useShopScope} returns which one it is, and {@link ShopScopeState} draws
 * the three that are not `ready`. Pages keep their own empty state for "readable,
 * but there is nothing in it yet", because that copy is theirs.
 */

import * as React from "react";
import { AlertTriangle, Store } from "lucide-react";
import { EmptyState, Card } from "@/components/primitives";
import { ErrorPanel } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import type { ApiError } from "@gopasal/api-client";
import type { PermissionId } from "@/lib/rbac";

export type ShopScope =
  /** The shop list has not answered yet. */
  | { kind: "loading" }
  /** The shop list could not be read. Not a permission problem. */
  | { kind: "failed"; error: ApiError }
  /** The list came back and this account is a member of no shop. */
  | { kind: "no-shops" }
  /** Shops exist; none of the ones in scope grants this permission. */
  | { kind: "denied" }
  /** Shops in scope that really do grant it. Never empty. */
  | { kind: "ready"; shopIds: string[] };

/**
 * The shops in the current scope that grant `perm`, or why there are none.
 *
 * The permission is checked per shop — `canInShop`, never an ambient check — so a
 * seller who owns one shop and helps out in another gets requests only for the one
 * that would answer them. Firing a request we know would 403 turns one missing
 * grant into a page-wide error.
 *
 * Pass an array when a screen genuinely needs several grants at once: the stock
 * screen reads products *and* their inventory, so a shop qualifies only if it
 * grants both.
 */
export function useShopScope(perm: PermissionId | readonly PermissionId[]): ShopScope {
  const { canInShop } = useAuth();
  const { scopedShopIds, shops, loading, error } = useShops();

  // A stable dependency: the array literal a caller writes inline is a new
  // identity on every render, the string it joins to is not.
  const permKey = Array.isArray(perm) ? perm.join(",") : (perm as string);

  const readable = React.useMemo(() => {
    const needed = permKey.split(",");
    return scopedShopIds.filter((id) => needed.every((key) => canInShop(id, key)));
  }, [scopedShopIds, canInShop, permKey]);

  return React.useMemo<ShopScope>(() => {
    if (readable.length > 0) return { kind: "ready", shopIds: readable };
    if (loading) return { kind: "loading" };
    if (error) return { kind: "failed", error };
    if (shops.length === 0) return { kind: "no-shops" };
    return { kind: "denied" };
  }, [readable, loading, error, shops.length]);
}

/** Shop ids to read, or `[]`. Convenience for the many call sites that join them. */
export function scopeShopIds(scope: ShopScope): string[] {
  return scope.kind === "ready" ? scope.shopIds : [];
}

/**
 * The panel for a scope that is not `ready`.
 *
 * `what` completes "You cannot see …" and `permLabel` names the grant to ask an
 * owner for, in the words the roles screen uses. Pass an array when the screen
 * needs several at once — the sentence then says every one of them is required and
 * that any of them may be the missing one, because the browser knows the shop
 * failed the conjunction and not which half. Returns `null` for `ready`, so a
 * caller can render it unconditionally above its own content.
 */
export function ShopScopeState({
  scope,
  what,
  permLabel,
  icon,
}: {
  scope: ShopScope;
  what: string;
  permLabel: string | readonly string[];
  icon?: React.ReactNode;
}) {
  const { reload } = useShops();

  if (scope.kind === "ready") return null;

  const labels = typeof permLabel === "string" ? [permLabel] : permLabel;
  const denied =
    labels.length > 1
      ? `Seeing ${what} needs every one of these on a shop: ${labels
          .map((label) => `“${label}”`)
          .join(", ")}. Ask an owner for whichever is missing.`
      : `You don’t have permission to view ${what} on the shop in scope. Ask an owner for the “${labels[0] ?? ""}” permission.`;

  if (scope.kind === "failed") {
    return (
      <ErrorPanel
        title="Couldn’t read the shops on your account"
        message={scope.error.message}
        offline={scope.error.offline}
        onRetry={() => void reload()}
      >
        {/* Said plainly, because the old copy blamed the seller's permissions for
            what is a failed request. */}
        <p className="mx-auto max-w-md text-xs text-ink-500">
          Until this list is read, GoPasal does not know which shops to show {what} for. This is not
          a permission problem.
        </p>
      </ErrorPanel>
    );
  }

  return (
    <Card className="p-0">
      <EmptyState
        icon={icon ?? (scope.kind === "denied" ? <AlertTriangle className="h-6 w-6" /> : <Store className="h-6 w-6" />)}
        title={
          scope.kind === "loading"
            ? "Loading your shops"
            : scope.kind === "no-shops"
              ? "No shop on this account"
              : `You can’t see ${what} here`
        }
        description={
          scope.kind === "loading"
            ? "One moment — reading the shops on your account."
            : scope.kind === "no-shops"
              ? "Your account is not a member of any shop yet, so there is nothing to show. If a shop was just approved or you were just added to one, sign in again."
              : denied
        }
      />
    </Card>
  );
}
