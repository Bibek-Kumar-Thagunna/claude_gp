"use client";

import * as React from "react";
import { type PermissionId } from "@/lib/rbac";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";

/* -------------------------------------------------------------- Seller session */

type SellerCtx = {
  /**
   * Authorization for the shop currently in scope, resolved from `GET /auth/me`.
   * Default-deny: no session, no `/auth/me` yet, or a key the API did not grant
   * ⇒ false. There is no role object behind this — see the note on
   * `SellerProvider` below.
   */
  can: (perm: PermissionId) => boolean;
  /** True when any one of the keys is held. Used for nav groups. */
  canAny: (perms: PermissionId[]) => boolean;
};

const SellerContext = React.createContext<SellerCtx | null>(null);

export function useSeller() {
  const ctx = React.useContext(SellerContext);
  if (!ctx) throw new Error("useSeller must be used within SellerProvider");
  return ctx;
}

/**
 * Console state that is neither the session nor the shop list.
 *
 * Shop identity used to live here as `SHOPS`/`scope`/`activeShop`. It now lives
 * in `ShopProvider`, loaded from `GET /seller/shops`, and this provider consumes
 * it — so `useSeller()` no longer answers "which shops?" at all. Screens ask
 * `useShops()` for that. The editable role catalogue and the `STAFF` fixture
 * used to live here too; both are gone, because Staff and Roles now read and
 * write the real team endpoints and hold their own server state. A language
 * context lived here too, holding an `en`/`np` value that no rendered string ever
 * consulted; it went with the toggle that set it. What remains here is
 * authorization, which is the only console-wide state that is not the session or
 * the shop list.
 *
 * Scoping `can` is now exact, which it could not be while `scope` held a fixture
 * id. `activeShopId` is a real `ShopAccess.shopId` when a shop is selected, so
 * the check is that shop's own resolved list — never a union that would offer,
 * say, "Cancel order" on shop B because it was granted on shop A. The
 * consolidated view (`activeShopId === null`) is the one place a union is the
 * honest answer: it asks whether the seller may do this *somewhere*, which is
 * exactly what an across-shops screen is showing.
 *
 * There is deliberately no owner short-circuit. `RbacService.describe()` has
 * already expanded a privileged role to every key *and* subtracted whatever the
 * shop's lifecycle forbids, so an `isOwner ||` branch here would hand a
 * SUSPENDED shop its buttons back.
 */
export function SellerProvider({ children }: { children: React.ReactNode }) {
  const { canInShop, canAnywhere } = useAuth();
  const { activeShopId } = useShops();

  const can = React.useCallback(
    (perm: PermissionId) => (activeShopId ? canInShop(activeShopId, perm) : canAnywhere(perm)),
    [activeShopId, canInShop, canAnywhere],
  );

  const canAny = React.useCallback((perms: PermissionId[]) => perms.some(can), [can]);

  const sellerValue = React.useMemo<SellerCtx>(() => ({ can, canAny }), [can, canAny]);

  return <SellerContext.Provider value={sellerValue}>{children}</SellerContext.Provider>;
}
