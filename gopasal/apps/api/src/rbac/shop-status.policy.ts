/**
 * What a shop's team may do *given the shop's lifecycle state*.
 *
 * RBAC answers "is this person allowed to do this?". It does not answer "is this
 * shop allowed to trade yet?" — and those are different questions. Before this
 * policy existed, an owner whose application was still PENDING (or had been
 * REJECTED outright) held their full Owner grant the moment the shop row was
 * created, so they could take orders and dispatch deliveries the platform had
 * never approved. Customer-facing reads were gated on ACTIVE; the seller side
 * was not, which is exactly the wrong way round.
 *
 * The rule is: preparation is always allowed, trading requires approval, and a
 * suspended shop drops to read-only. Enforced centrally in PermissionsGuard so a
 * new seller endpoint cannot forget it.
 */

import type { ShopStatus } from '@prisma/client';
import type { PermScope } from './permissions.catalog';

/**
 * Alias of Prisma's `ShopStatus` rather than a hand-copied union. Deriving it
 * means adding a lifecycle state to the schema surfaces here — the `switch`
 * below stops being exhaustive — instead of silently falling through to the
 * default branch and locking a real shop out.
 */
export type ShopLifecycle = ShopStatus;

/** Keys a shop may use before the platform has approved it — set-up work only. */
const PREPARE_ONLY = new Set<string>([
  'dashboard.view',
  'settings.view',
  'settings.manage',
  'catalog.view',
  'catalog.create',
  'catalog.edit',
  'catalog.delete',
  'catalog.import',
  'inventory.view',
  'inventory.adjust',
  'team.view',
  'team.invite',
  'rbac.manage',
]);

/**
 * Keys a REJECTED shop keeps: enough to read the decision, fix what was wrong
 * and resubmit. Nothing that touches customers, staff access or stock.
 */
const REJECTED_ALLOWED = new Set<string>([
  'dashboard.view',
  'settings.view',
  'settings.manage',
  'team.view',
]);

/** A SUSPENDED shop can look but not touch — every `.view` key, nothing else. */
function isReadOnlyKey(key: string): boolean {
  return key.endsWith('.view');
}

export interface ShopStatusVerdict {
  allowed: boolean;
  /** Customer-facing sentence explaining *why*, not a raw enum. */
  reason?: string;
}

/**
 * Decide whether `key` is usable while the shop sits in `status`.
 * PLATFORM keys are never affected — a platform operator's authority does not
 * depend on the state of the shop they are looking at.
 */
export function shopStatusAllows(
  status: ShopLifecycle,
  key: string,
  scope: PermScope,
): ShopStatusVerdict {
  if (scope !== 'SHOP') return { allowed: true };

  switch (status) {
    case 'ACTIVE':
      return { allowed: true };

    case 'PENDING':
      return PREPARE_ONLY.has(key)
        ? { allowed: true }
        : {
            allowed: false,
            reason:
              'This shop is still awaiting approval. You can set up your catalog, team and settings now — selling opens once GoPasal approves the application.',
          };

    case 'REJECTED':
      return REJECTED_ALLOWED.has(key)
        ? { allowed: true }
        : {
            allowed: false,
            reason:
              'This application was not approved. Update the details GoPasal asked about and resubmit it from Settings.',
          };

    case 'SUSPENDED':
      return isReadOnlyKey(key)
        ? { allowed: true }
        : {
            allowed: false,
            reason:
              'This shop is suspended, so it is read-only. Contact GoPasal support to have it reviewed.',
          };

    default:
      return { allowed: false, reason: 'This shop is not available.' };
  }
}
