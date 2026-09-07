import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RolesService } from './roles.service';

/**
 * Editing a custom role: what reaches `role.update`, and when the permission set is
 * replaced rather than left alone.
 *
 * `common/dto/request-validation.spec.ts` pins the pipe — which keys `UpdateRoleDto`
 * lets through, and that every field is `@IsOptional()`, so `null` is *not* a 400.
 * This file pins the half that decides what `null` then means, because the service is
 * where the safety actually lives:
 *
 * - `name: patch.name?.trim()` collapses a missing *or* null name to `undefined`, and
 *   Prisma leaves a column alone on `undefined`. A role therefore cannot be made
 *   nameless through this route even though the DTO admits the value.
 * - `description: patch.description` is written straight through, so `''` and `null`
 *   both clear the column (`Role.description` is `String?`). The console's role editor
 *   has no other spelling for "remove this".
 *
 * The other half is `permissions`. It is guarded by `if (patch.permissions)`, so a
 * rename must not touch `RolePermission` — if that check ever loosened to a truthy
 * check on a defaulted `[]`, saving a role's name would silently strip every
 * permission from it and lock a whole team out of the shop. The double-write
 * (`deleteMany` then `createMany`) is asserted in order for the same reason: it is a
 * replace, and it has to happen inside the transaction that also updates the row.
 *
 * The fake records instead of pretending: guards that fail to throw leave `update`
 * reachable, and the assertions on `calls` say so.
 */

interface RoleRow {
  id: string;
  scope: 'SHOP' | 'PLATFORM';
  shopId: string | null;
  isSystem: boolean;
  isPrivileged: boolean;
}

interface Recorded {
  updates: Record<string, unknown>[];
  permissionDeletes: string[];
  permissionCreates: { roleId: string; permissionKey: string }[][];
  /** Every write, in the order it happened, so a replace can be checked as a sequence. */
  order: string[];
}

const CUSTOM: RoleRow = {
  id: 'role_custom',
  scope: 'SHOP',
  shopId: 'shop_a',
  isSystem: false,
  isPrivileged: false,
};
const SYSTEM: RoleRow = {
  id: 'role_system',
  scope: 'SHOP',
  shopId: null,
  isSystem: true,
  isPrivileged: false,
};
const OWNER: RoleRow = {
  id: 'role_owner',
  scope: 'SHOP',
  shopId: 'shop_a',
  isSystem: false,
  isPrivileged: true,
};
const FOREIGN: RoleRow = {
  id: 'role_theirs',
  scope: 'SHOP',
  shopId: 'shop_b',
  isSystem: false,
  isPrivileged: false,
};

function harness(): { roles: RolesService; calls: Recorded } {
  const calls: Recorded = { updates: [], permissionDeletes: [], permissionCreates: [], order: [] };
  const rows = [CUSTOM, SYSTEM, OWNER, FOREIGN];

  const tx = {
    role: {
      update: ({ data }: { data: Record<string, unknown> }) => {
        calls.updates.push(data);
        calls.order.push('role.update');
        return Promise.resolve({ ...CUSTOM, ...data, permissions: [] });
      },
    },
    rolePermission: {
      deleteMany: ({ where }: { where: { roleId: string } }) => {
        calls.permissionDeletes.push(where.roleId);
        calls.order.push('rolePermission.deleteMany');
        return Promise.resolve({ count: 0 });
      },
      createMany: ({ data }: { data: { roleId: string; permissionKey: string }[] }) => {
        calls.permissionCreates.push(data);
        calls.order.push('rolePermission.createMany');
        return Promise.resolve({ count: data.length });
      },
    },
  };

  const prisma = {
    role: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
    },
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  return { roles: new RolesService(prisma), calls };
}

/** Nothing was written at all — the guard ran before the transaction opened. */
function assertUntouched(calls: Recorded): void {
  assert.deepEqual(calls.order, []);
}

describe('role PATCH · what null and empty mean once past the pipe', () => {
  it('clears the description on an empty string', async () => {
    const { roles, calls } = harness();
    await roles.update(CUSTOM.id, { description: '' }, 'shop_a');

    assert.deepEqual(calls.updates, [{ name: undefined, description: '' }]);
  });

  it('leaves the name alone on null but clears the description', async () => {
    const { roles, calls } = harness();
    // The DTO admits both — `@IsOptional()` skips its validators on null — so the
    // service is the only thing standing between a null name and a nameless role.
    await roles.update(
      CUSTOM.id,
      { name: null, description: null } as unknown as { name?: string; description?: string },
      'shop_a',
    );

    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0].name, undefined, 'a null name must not reach the column');
    assert.equal(calls.updates[0].description, null, 'a null description clears it');
  });

  it('trims a name before writing it', async () => {
    const { roles, calls } = harness();
    await roles.update(CUSTOM.id, { name: '  Packer  ' }, 'shop_a');

    assert.deepEqual(calls.updates, [{ name: 'Packer', description: undefined }]);
  });
});

describe('role PATCH · a rename must not disturb the permission set', () => {
  it('does not touch RolePermission when permissions are omitted', async () => {
    const { roles, calls } = harness();
    await roles.update(CUSTOM.id, { name: 'Packer' }, 'shop_a');

    assert.deepEqual(calls.order, ['role.update']);
    assert.deepEqual(calls.permissionDeletes, []);
    assert.deepEqual(calls.permissionCreates, []);
  });

  it('replaces the whole set when permissions are sent, inside the same transaction', async () => {
    const { roles, calls } = harness();
    await roles.update(CUSTOM.id, { permissions: ['orders.view', 'catalog.edit'] }, 'shop_a');

    assert.deepEqual(calls.order, [
      'rolePermission.deleteMany',
      'rolePermission.createMany',
      'role.update',
    ]);
    assert.deepEqual(calls.permissionDeletes, [CUSTOM.id]);
    assert.deepEqual(calls.permissionCreates, [
      [
        { roleId: CUSTOM.id, permissionKey: 'orders.view' },
        { roleId: CUSTOM.id, permissionKey: 'catalog.edit' },
      ],
    ]);
  });

  it('takes an empty list literally — that is how a role is emptied', async () => {
    const { roles, calls } = harness();
    // `[]` is falsy-adjacent but not falsy, so it reaches the replace branch and the
    // role ends up with no permissions. Deliberate: the editor can uncheck the last box.
    await roles.update(CUSTOM.id, { permissions: [] }, 'shop_a');

    assert.deepEqual(calls.permissionDeletes, [CUSTOM.id]);
    assert.deepEqual(calls.permissionCreates, [[]]);
  });

  it('refuses an unknown key before writing anything', async () => {
    const { roles, calls } = harness();
    await assert.rejects(
      () => roles.update(CUSTOM.id, { permissions: ['orders.view', 'orders.teleport'] }, 'shop_a'),
      BadRequestException,
    );
    assertUntouched(calls);
  });

  it('refuses a PLATFORM key on a SHOP role', async () => {
    const { roles, calls } = harness();
    await assert.rejects(
      () => roles.update(CUSTOM.id, { permissions: ['shops.approve'] }, 'shop_a'),
      BadRequestException,
    );
    assertUntouched(calls);
  });
});

describe('role PATCH · which roles are editable at all', () => {
  it('refuses a seeded system role', async () => {
    const { roles, calls } = harness();
    await assert.rejects(
      () => roles.update(SYSTEM.id, { name: 'Manager+' }, 'shop_a'),
      ForbiddenException,
    );
    assertUntouched(calls);
  });

  it('refuses the privileged role, so Owner cannot be edited down', async () => {
    const { roles, calls } = harness();
    await assert.rejects(() => roles.update(OWNER.id, { name: 'Not owner' }, 'shop_a'), ForbiddenException);
    assertUntouched(calls);
  });

  it('answers 404 for another shop’s role, exactly as for one that does not exist', async () => {
    const { roles, calls } = harness();
    for (const id of [FOREIGN.id, 'role_nope']) {
      await assert.rejects(() => roles.update(id, { name: 'Mine now' }, 'shop_a'), (err: unknown) => {
        assert.ok(err instanceof NotFoundException, `expected a 404, got ${String(err)}`);
        assert.equal(err.message, 'Role not found');
        return true;
      });
    }
    assertUntouched(calls);
  });

  it('requires a shop scope for a shop role', async () => {
    const { roles, calls } = harness();
    await assert.rejects(() => roles.update(CUSTOM.id, { name: 'Packer' }), BadRequestException);
    assertUntouched(calls);
  });
});
