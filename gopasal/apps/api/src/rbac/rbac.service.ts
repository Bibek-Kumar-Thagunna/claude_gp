import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PERMISSION_SCOPE, PLATFORM_PERMISSIONS, SHOP_PERMISSIONS } from './permissions.catalog';
import { shopStatusAllows, type ShopLifecycle, type ShopStatusVerdict } from './shop-status.policy';

/**
 * A user's fully-resolved authorisation picture, loaded once per request.
 *  - `superAdmin`  → privileged PLATFORM role (Super Admin): passes every check.
 *  - `platform`    → granted PLATFORM permission keys.
 *  - `shops`       → per-shop grant; `privileged` marks a shop Owner (passes
 *                    every SHOP check for that shop). `status` is the shop's
 *                    lifecycle state, carried here so the guard can apply
 *                    `shopStatusAllows` without a second query.
 */
export interface ShopGrant {
  privileged: boolean;
  perms: Set<string>;
  status: ShopLifecycle;
}

export interface RbacContext {
  userId: string;
  superAdmin: boolean;
  platform: Set<string>;
  shops: Map<string, ShopGrant>;
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /** One query pair → the caller's complete grant set. */
  async loadContext(userId: string): Promise<RbacContext> {
    const [platform, shopMems] = await Promise.all([
      this.prisma.platformMembership.findUnique({
        where: { userId },
        include: { role: { include: { permissions: true } } },
      }),
      this.prisma.shopMembership.findMany({
        where: { userId, status: 'ACTIVE' },
        include: {
          role: { include: { permissions: true } },
          shop: { select: { status: true } },
        },
      }),
    ]);

    const superAdmin = !!platform && platform.role.isPrivileged;
    const platformPerms = new Set<string>(
      platform ? platform.role.permissions.map((p) => p.permissionKey) : [],
    );

    const shops = new Map<string, ShopGrant>();
    for (const m of shopMems) {
      shops.set(m.shopId, {
        privileged: m.role.isPrivileged,
        perms: new Set(m.role.permissions.map((p) => p.permissionKey)),
        status: m.shop.status,
      });
    }

    return { userId, superAdmin, platform: platformPerms, shops };
  }

  /**
   * Default-deny check against an already-loaded context. Scope is inferred
   * from the permission catalogue; SHOP-scoped keys require `shopId`.
   *
   * Two questions are answered here, and both must pass: does this person hold
   * the grant, and is the shop in a lifecycle state where the grant means
   * anything? The second half is what stops an unapproved shop from trading.
   */
  contextExplain(ctx: RbacContext, key: string, shopId?: string): ShopStatusVerdict {
    if (ctx.superAdmin) return { allowed: true }; // god-mode

    const scope = PERMISSION_SCOPE[key];
    if (!scope) return { allowed: false }; // unknown permission → deny

    if (scope === 'PLATFORM') {
      return { allowed: ctx.platform.has(key) };
    }

    // SHOP scope
    if (!shopId) return { allowed: false };
    const grant = ctx.shops.get(shopId);
    if (!grant) return { allowed: false };
    if (!grant.privileged && !grant.perms.has(key)) return { allowed: false };

    return shopStatusAllows(grant.status, key, scope);
  }

  contextCan(ctx: RbacContext, key: string, shopId?: string): boolean {
    return this.contextExplain(ctx, key, shopId).allowed;
  }

  /** Convenience single-check (loads context internally). */
  async can(userId: string, key: string, shopId?: string): Promise<boolean> {
    const ctx = await this.loadContext(userId);
    return this.contextCan(ctx, key, shopId);
  }

  /** Throwable variant used inside services when a guard isn't in play. */
  async assert(userId: string, key: string, shopId?: string): Promise<void> {
    const ok = await this.can(userId, key, shopId);
    if (!ok) {
      const { ForbiddenException } = await import('@nestjs/common');
      throw new ForbiddenException(`Missing permission: ${key}`);
    }
  }

  /**
   * Flat view of a user's effective permissions, for the `/auth/me` payload and
   * for driving UI visibility on the seller/admin apps.
   *
   * `permissions` is the *effective* list — already filtered by the shop's
   * lifecycle state — so a console rendered from this payload cannot offer an
   * action the guard would then refuse. Owners get an expanded list rather than
   * `'*'` for the same reason: `'*'` would hide the fact that a PENDING shop
   * cannot yet take orders.
   */
  async describe(userId: string): Promise<{
    superAdmin: boolean;
    platform: string[];
    shops: {
      shopId: string;
      owner: boolean;
      status: ShopLifecycle;
      restricted: boolean;
      restrictionReason?: string;
      permissions: string[];
    }[];
  }> {
    const ctx = await this.loadContext(userId);
    const shopKeys = SHOP_PERMISSIONS.map((p) => p.key);

    return {
      superAdmin: ctx.superAdmin,
      platform: ctx.superAdmin ? PLATFORM_PERMISSIONS.map((p) => p.key) : [...ctx.platform],
      shops: [...ctx.shops.entries()].map(([shopId, g]) => {
        const held = g.privileged ? shopKeys : shopKeys.filter((k) => g.perms.has(k));
        const effective = held.filter((k) => shopStatusAllows(g.status, k, 'SHOP').allowed);
        const blocked = held.find((k) => !shopStatusAllows(g.status, k, 'SHOP').allowed);
        return {
          shopId,
          owner: g.privileged,
          status: g.status,
          restricted: effective.length !== held.length,
          restrictionReason: blocked
            ? shopStatusAllows(g.status, blocked, 'SHOP').reason
            : undefined,
          permissions: effective,
        };
      }),
    };
  }
}
