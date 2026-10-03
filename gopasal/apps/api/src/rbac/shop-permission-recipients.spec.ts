import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RbacService } from './rbac.service';

/**
 * Who should hear about something that happened at a shop.
 *
 * `can` answers "may this person act"; this is the same question backwards —
 * "who may act" — and it exists because notifying a shop by notifying its owner
 * is right for a one-person shop and wrong for every other kind. The counter
 * assistant is the person standing there when an order arrives. The owner may
 * be asleep.
 *
 * What is pinned here is the *query*, not a fake permission engine: the filter
 * is the whole safety argument, so the test asserts the exact `where` that goes
 * to Prisma. Three clauses matter and each has cost somebody somewhere a
 * notification sent to a person who should not have had it:
 *
 *  - the membership is ACTIVE, so a suspended assistant stops being told;
 *  - the *user* is ACTIVE, so a closed account is not pushed to;
 *  - a privileged role qualifies without the key being listed against it,
 *    matching `can`'s own rule, so an Owner is not silently left out of a
 *    permission nobody thought to grant them explicitly.
 */

type Where = {
  shopId: string;
  status: string;
  user: { status: string };
  OR: [{ role: { isPrivileged: boolean } }, { role: { permissions: { some: { permissionKey: string } } } }];
};

function serviceReturning(rows: { userId: string }[]): {
  rbac: RbacService;
  seen: { where: Where }[];
} {
  const seen: { where: Where }[] = [];
  const prisma = {
    shopMembership: {
      findMany(args: { where: Where }) {
        seen.push(args);
        return Promise.resolve(rows);
      },
    },
  } as unknown as PrismaService;
  return { rbac: new RbacService(prisma), seen };
}

describe('usersWithShopPermission', () => {
  it('asks only for active memberships of active users', async () => {
    const { rbac, seen } = serviceReturning([]);
    await rbac.usersWithShopPermission('shop-1', 'orders.view');

    const where = seen[0].where;
    assert.equal(where.shopId, 'shop-1');
    assert.equal(where.status, 'ACTIVE');
    assert.deepEqual(where.user, { status: 'ACTIVE' });
  });

  it('counts a privileged role as holding the permission', async () => {
    const { rbac, seen } = serviceReturning([]);
    await rbac.usersWithShopPermission('shop-1', 'orders.view');

    // The same rule `can` applies. Without this branch an Owner whose role
    // never listed `orders.view` explicitly would stop being told about
    // orders at their own shop.
    assert.deepEqual(seen[0].where.OR[0], { role: { isPrivileged: true } });
    assert.deepEqual(seen[0].where.OR[1], {
      role: { permissions: { some: { permissionKey: 'orders.view' } } },
    });
  });

  it('returns each person once, however many memberships they hold', async () => {
    // An owner who is also listed as an order handler is one phone.
    const { rbac } = serviceReturning([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u1' }]);
    const users = await rbac.usersWithShopPermission('shop-1', 'orders.view');
    assert.deepEqual(users, ['u1', 'u2']);
  });

  it('returns nothing rather than throwing for a shop with no staff', async () => {
    const { rbac } = serviceReturning([]);
    assert.deepEqual(await rbac.usersWithShopPermission('ghost-shop', 'orders.view'), []);
  });

  it('carries the permission key through verbatim', async () => {
    const { rbac, seen } = serviceReturning([]);
    await rbac.usersWithShopPermission('shop-1', 'messages.view');
    assert.deepEqual(seen[0].where.OR[1], {
      role: { permissions: { some: { permissionKey: 'messages.view' } } },
    });
  });
});
