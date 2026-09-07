import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { MembershipsService } from './memberships.service';

/**
 * Shop staff administration, from the outside: which role ids a shop may assign, and
 * which memberships it may touch.
 *
 * Two separate guards are pinned.
 *
 * **Role scoping (`assertShopRole`).** A shop may assign a global SHOP role (the seeded
 * Manager, Order Handler, …) or a clone that belongs to it. A PLATFORM role and another
 * shop's private role both answer `404 "Role not found"`. They used to answer two
 * different 400s — `'Not a shop role'` and `'Role belongs to another shop'` — which
 * together turned the role table into something a caller could map by id: one request
 * per guess told you whether an id was a real platform role, a real role in a rival's
 * shop, or nothing at all. A legitimate console never needs the distinction, because
 * its picker only offers ids `listAssignable` returned.
 *
 * **Owner protection.** A privileged membership cannot be re-roled, suspended or
 * removed through this surface, and nobody can be promoted *into* a privileged role.
 * Without the first half a manager could lock the owner out of their own shop; without
 * the second, `rbac.manage` would be a self-service path to Owner.
 */

interface RoleRow {
  id: string;
  scope: 'SHOP' | 'PLATFORM';
  shopId: string | null;
  isPrivileged: boolean;
}

interface MembershipRow {
  id: string;
  shopId: string;
  roleId: string;
  role: { isPrivileged: boolean };
}

const GLOBAL_MANAGER: RoleRow = { id: 'role_mgr', scope: 'SHOP', shopId: null, isPrivileged: false };
const MY_CLONE: RoleRow = { id: 'role_mine', scope: 'SHOP', shopId: 'shop_a', isPrivileged: false };
const THEIR_CLONE: RoleRow = { id: 'role_theirs', scope: 'SHOP', shopId: 'shop_b', isPrivileged: false };
const OWNER_ROLE: RoleRow = { id: 'role_owner', scope: 'SHOP', shopId: null, isPrivileged: true };
const PLATFORM_ROLE: RoleRow = { id: 'role_ops', scope: 'PLATFORM', shopId: null, isPrivileged: false };

const STAFF: MembershipRow = {
  id: 'mem_1',
  shopId: 'shop_a',
  roleId: GLOBAL_MANAGER.id,
  role: { isPrivileged: false },
};
const OWNER: MembershipRow = {
  id: 'mem_owner',
  shopId: 'shop_a',
  roleId: OWNER_ROLE.id,
  role: { isPrivileged: true },
};
const FOREIGN_STAFF: MembershipRow = {
  id: 'mem_2',
  shopId: 'shop_b',
  roleId: GLOBAL_MANAGER.id,
  role: { isPrivileged: false },
};

function harness(): { staff: MembershipsService; writes: Record<string, unknown>[]; deletes: string[] } {
  const writes: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  const roles = [GLOBAL_MANAGER, MY_CLONE, THEIR_CLONE, OWNER_ROLE, PLATFORM_ROLE];
  const memberships = [STAFF, OWNER, FOREIGN_STAFF];

  const prisma = {
    role: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(roles.find((r) => r.id === where.id) ?? null),
    },
    shopMembership: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(memberships.find((m) => m.id === where.id) ?? null),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: where.id, ...data });
        return Promise.resolve(STAFF);
      },
      delete: ({ where }: { where: { id: string } }) => {
        deletes.push(where.id);
        return Promise.resolve(STAFF);
      },
    },
  } as unknown as PrismaService;

  return { staff: new MembershipsService(prisma), writes, deletes };
}

async function expect404(run: () => Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(run, (err: unknown) => {
    assert.ok(err instanceof NotFoundException, `expected a 404, got ${String(err)}`);
    assert.equal(err.message, message);
    return true;
  });
}

describe('assignable roles · one answer for every unusable id', () => {
  it('refuses a PLATFORM role with the same 404 as a nonexistent one', async () => {
    const { staff, writes } = harness();
    await expect404(() => staff.changeRole('shop_a', STAFF.id, PLATFORM_ROLE.id), 'Role not found');
    await expect404(() => staff.changeRole('shop_a', STAFF.id, 'role_nope'), 'Role not found');
    assert.deepEqual(writes, []);
  });

  it('refuses another shop’s private role, again indistinguishably', async () => {
    const { staff, writes } = harness();
    await expect404(() => staff.changeRole('shop_a', STAFF.id, THEIR_CLONE.id), 'Role not found');
    assert.deepEqual(writes, []);
  });

  it('accepts a global SHOP role and this shop’s own clone', async () => {
    const { staff, writes } = harness();
    await staff.changeRole('shop_a', STAFF.id, GLOBAL_MANAGER.id);
    await staff.changeRole('shop_a', STAFF.id, MY_CLONE.id);

    assert.deepEqual(writes, [
      { id: STAFF.id, roleId: GLOBAL_MANAGER.id },
      { id: STAFF.id, roleId: MY_CLONE.id },
    ]);
  });

  it('refuses to promote staff into the privileged role', async () => {
    const { staff, writes } = harness();
    await assert.rejects(
      () => staff.changeRole('shop_a', STAFF.id, OWNER_ROLE.id),
      BadRequestException,
    );
    assert.deepEqual(writes, []);
  });
});

describe('cross-shop staff writes', () => {
  it('cannot re-role a membership in another shop', async () => {
    const { staff, writes } = harness();
    await expect404(
      () => staff.changeRole('shop_a', FOREIGN_STAFF.id, GLOBAL_MANAGER.id),
      'Team member not found',
    );
    assert.deepEqual(writes, []);
  });

  it('cannot suspend a membership in another shop', async () => {
    const { staff, writes } = harness();
    await expect404(
      () => staff.setStatus('shop_a', FOREIGN_STAFF.id, MembershipStatus.SUSPENDED),
      'Team member not found',
    );
    assert.deepEqual(writes, []);
  });

  it('cannot remove a membership in another shop', async () => {
    const { staff, deletes } = harness();
    await expect404(() => staff.removeStaff('shop_a', FOREIGN_STAFF.id), 'Team member not found');
    assert.deepEqual(deletes, []);
  });

  it('answers the same for a membership id that does not exist', async () => {
    const { staff } = harness();
    await expect404(() => staff.removeStaff('shop_a', 'mem_nope'), 'Team member not found');
  });
});

describe('the owner cannot be locked out of their own shop', () => {
  it('refuses to change the owner’s role', async () => {
    const { staff, writes } = harness();
    await assert.rejects(
      () => staff.changeRole('shop_a', OWNER.id, GLOBAL_MANAGER.id),
      BadRequestException,
    );
    assert.deepEqual(writes, []);
  });

  it('refuses to suspend the owner', async () => {
    const { staff, writes } = harness();
    await assert.rejects(
      () => staff.setStatus('shop_a', OWNER.id, MembershipStatus.SUSPENDED),
      BadRequestException,
    );
    assert.deepEqual(writes, []);
  });

  it('refuses to remove the owner', async () => {
    const { staff, deletes } = harness();
    await assert.rejects(() => staff.removeStaff('shop_a', OWNER.id), BadRequestException);
    assert.deepEqual(deletes, []);
  });

  it('still allows ordinary staff to be suspended and removed', async () => {
    const { staff, writes, deletes } = harness();
    await staff.setStatus('shop_a', STAFF.id, MembershipStatus.SUSPENDED);
    await staff.removeStaff('shop_a', STAFF.id);

    assert.deepEqual(writes, [{ id: STAFF.id, status: MembershipStatus.SUSPENDED }]);
    assert.deepEqual(deletes, [STAFF.id]);
  });
});
