import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService, type RbacContext, type ShopGrant } from '../../rbac/rbac.service';
import { ShopsService } from './shops.service';

/**
 * Who may save shop settings, and what the save actually writes.
 *
 * The route is `PATCH /api/v1/seller/shops/:shopId`, guarded by
 * `@RequirePermissions('settings.manage')`. It is the seller console's only write
 * to a `Shop` row, and — unlike coupons or products — `ShopsService.update` has no
 * tenancy check of its own: the shop id *is* the path parameter the guard resolved
 * its verdict from, so membership in that shop is the whole of the check. That makes
 * the guard's answer load-bearing in a way worth pinning, which is what the first
 * half of this file does.
 *
 * `contextExplain` is exercised directly rather than through an HTTP request: it is
 * the function `PermissionsGuard` calls once it has resolved the shop id from
 * `req.params.shopId`, so a verdict here is the verdict the route gives. What it
 * cannot cover is the resolution step itself; that is asserted in the guard's own
 * neighbours, and the DTO's refusal of a body `shopId` is pinned in
 * `common/dto/request-validation.spec.ts`.
 */

const SETTINGS_MANAGE = 'settings.manage';
const SETTINGS_VIEW = 'settings.view';

function grant(perms: string[], status: ShopGrant['status'], privileged = false): ShopGrant {
  return { privileged, perms: new Set(perms), status };
}

/** A member of shop_a and nothing else. */
function ctx(shops: Record<string, ShopGrant>, superAdmin = false): RbacContext {
  return {
    userId: 'usr_1',
    superAdmin,
    platform: new Set<string>(),
    shops: new Map(Object.entries(shops)),
  };
}

const rbac = new RbacService({} as unknown as PrismaService);

describe('saving shop settings · who the guard lets through', () => {
  it('allows a member who holds settings.manage in that shop', () => {
    const who = ctx({ shop_a: grant([SETTINGS_VIEW, SETTINGS_MANAGE], 'ACTIVE') });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), true);
  });

  it('refuses a member who can only read the settings', () => {
    // The console's own split: `settings.view` renders the screen, `settings.manage`
    // is what makes any field editable.
    const who = ctx({ shop_a: grant([SETTINGS_VIEW], 'ACTIVE') });
    assert.equal(rbac.contextCan(who, SETTINGS_VIEW, 'shop_a'), true);
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), false);
  });

  it('refuses the grant when it is held in a different shop', () => {
    // The defect this rules out is the browser-side one: holding `settings.manage`
    // *somewhere* must never save shop B. The API agrees — the grant is per shop.
    const who = ctx({
      shop_a: grant([SETTINGS_VIEW, SETTINGS_MANAGE], 'ACTIVE'),
      shop_b: grant([SETTINGS_VIEW], 'ACTIVE'),
    });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), true);
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_b'), false);
  });

  it('refuses a shop the caller is not a member of at all', () => {
    const who = ctx({ shop_a: grant([SETTINGS_VIEW, SETTINGS_MANAGE], 'ACTIVE') });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_stranger'), false);
  });

  it('refuses a SHOP-scoped save with no shop id resolved', () => {
    // If `resolveShopId` finds nothing there is no tenant, and default-deny applies.
    // This is also why the console must never send the `"all"` sentinel: it would be
    // a shop id the caller has no grant for, not a wildcard.
    const who = ctx({ shop_a: grant([SETTINGS_VIEW, SETTINGS_MANAGE], 'ACTIVE') });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, undefined), false);
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'all'), false);
  });

  it('lets a shop owner through without the key being listed', () => {
    // `isPrivileged` skips the per-key check — but not the lifecycle check below.
    const who = ctx({ shop_a: grant([], 'ACTIVE', true) });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), true);
  });

  it('does not let an owner of one shop reach another', () => {
    const who = ctx({ shop_a: grant([], 'ACTIVE', true) });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_b'), false);
  });
});

describe('saving shop settings · what the shop’s lifecycle allows', () => {
  it('allows a PENDING shop to fix its details while it waits', () => {
    const who = ctx({ shop_a: grant([SETTINGS_MANAGE], 'PENDING') });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), true);
  });

  it('allows a REJECTED shop to correct what the review asked about', () => {
    const who = ctx({ shop_a: grant([SETTINGS_MANAGE], 'REJECTED') });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), true);
  });

  it('refuses a SUSPENDED shop, with the sentence the console shows', () => {
    const who = ctx({ shop_a: grant([SETTINGS_VIEW, SETTINGS_MANAGE], 'SUSPENDED') });
    const verdict = rbac.contextExplain(who, SETTINGS_MANAGE, 'shop_a');

    assert.equal(verdict.allowed, false);
    assert.equal(
      verdict.reason,
      'This shop is suspended, so it is read-only. Contact GoPasal support to have it reviewed.',
    );
    // …while still being able to read them.
    assert.equal(rbac.contextCan(who, SETTINGS_VIEW, 'shop_a'), true);
  });

  it('refuses a suspended shop even to its owner', () => {
    const who = ctx({ shop_a: grant([], 'SUSPENDED', true) });
    assert.equal(rbac.contextCan(who, SETTINGS_MANAGE, 'shop_a'), false);
  });

  it('keeps this out of `describe()`, so the console never offers the save', async () => {
    // `/auth/me` reports *effective* permissions. The seller app's `canInShop` is
    // computed from that payload, so a suspended shop's settings screen is read-only
    // without the browser knowing anything about lifecycle rules.
    const prisma = {
      platformMembership: { findUnique: () => Promise.resolve(null) },
      shopMembership: {
        findMany: () =>
          Promise.resolve([
            {
              shopId: 'shop_a',
              role: { isPrivileged: true, permissions: [] },
              shop: { status: 'SUSPENDED' },
            },
          ]),
      },
    } as unknown as PrismaService;

    const described = await new RbacService(prisma).describe('usr_1');
    const shop = described.shops.find((s) => s.shopId === 'shop_a');

    assert.ok(shop, 'the shop must be reported');
    assert.equal(shop.restricted, true);
    assert.ok(shop.permissions.includes(SETTINGS_VIEW));
    assert.ok(
      !shop.permissions.includes(SETTINGS_MANAGE),
      'a suspended shop must not report settings.manage as effective',
    );
  });
});

describe('ShopsService.update · a real partial write', () => {
  interface Written {
    where: { id: string };
    data: Record<string, unknown>;
  }

  function harness(ids: string[] = ['shop_a']): { shops: ShopsService; writes: Written[] } {
    const writes: Written[] = [];
    const prisma = {
      shop: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(ids.includes(where.id) ? { id: where.id } : null),
        update: ({ where, data }: Written) => {
          writes.push({ where, data });
          return Promise.resolve({ id: where.id, ...data });
        },
      },
    } as unknown as PrismaService;
    return { shops: new ShopsService(prisma), writes };
  }

  it('sends exactly the keys it was given and no others', async () => {
    // The console submits a diff, so this is the contract that makes "leave the rest
    // alone" true: nothing is defaulted, nothing absent is written as null.
    const { shops, writes } = harness();
    await shops.update('shop_a', { isOpen: false });

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0]?.where, { id: 'shop_a' });
    assert.deepEqual(writes[0]?.data, { isOpen: false });
  });

  it('writes a cleared text field as an empty string, not as a removal', async () => {
    const { shops, writes } = harness();
    await shops.update('shop_a', { description: '', hours: '' });
    assert.deepEqual(writes[0]?.data, { description: '', hours: '' });
  });

  it('returns the row Prisma returned, which is a bare Shop', async () => {
    // No `myRole`, no `_count`, no `category` — the shapes `GET /seller/shops` and
    // `GET /seller/shops/:shopId` return. The console therefore refetches after a
    // save instead of merging this into its list.
    const { shops } = harness();
    const row = (await shops.update('shop_a', { name: 'Renamed' })) as Record<string, unknown>;

    assert.equal(row.name, 'Renamed');
    assert.ok(!('myRole' in row));
    assert.ok(!('_count' in row));
  });

  it('answers 404 for a shop id that does not exist, without writing', async () => {
    const { shops, writes } = harness();
    await assert.rejects(
      () => shops.update('shop_nope', { name: 'Anything' }),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException, `expected a 404, got ${String(err)}`);
        assert.equal(err.message, 'Shop not found');
        return true;
      },
    );
    assert.deepEqual(writes, [], 'the write must not have been reached');
  });

  it('accepts an empty patch as a no-op write rather than an error', async () => {
    const { shops, writes } = harness();
    await shops.update('shop_a', {});
    assert.deepEqual(writes[0]?.data, {});
  });
});
