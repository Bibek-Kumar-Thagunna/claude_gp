import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  PERMISSION_SCOPE,
  PLATFORM_PERMISSIONS,
  SHOP_PERMISSIONS,
  type PermScope,
} from './permissions.catalog';

/**
 * Role administration — the "editable / clonable roles" requirement.
 *
 * System roles (seeded) are read-only templates: they cannot be edited or
 * deleted, but a shop owner / super admin can CLONE one into a custom role and
 * then tweak its permissions. Custom roles are fully editable.
 *
 * SHOP roles are always scoped to a single shop (`shopId`); PLATFORM roles have
 * `shopId = null`. Permission keys assigned to a role must match the role scope.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The catalogue, grouped, for building role editors in the UI. */
  catalog(scope: PermScope) {
    const perms = scope === 'PLATFORM' ? PLATFORM_PERMISSIONS : SHOP_PERMISSIONS;
    const groups: Record<string, typeof perms> = {};
    for (const p of perms) (groups[p.group] ??= []).push(p);
    return Object.entries(groups).map(([group, permissions]) => ({ group, permissions }));
  }

  /** Roles visible in a scope. For SHOP, returns this shop's roles + system templates. */
  async list(scope: PermScope, shopId?: string) {
    if (scope === 'SHOP') {
      if (!shopId) throw new BadRequestException('shopId is required for shop roles');
      return this.prisma.role.findMany({
        where: { scope: 'SHOP', OR: [{ shopId }, { isSystem: true, shopId: null }] },
        include: { permissions: true, _count: { select: { shopMemberships: true } } },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    }
    return this.prisma.role.findMany({
      where: { scope: 'PLATFORM' },
      include: { permissions: true, _count: { select: { platformMemberships: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(input: {
    scope: PermScope;
    shopId?: string;
    name: string;
    description?: string;
    permissions: string[];
  }) {
    if (input.scope === 'SHOP' && !input.shopId) {
      throw new BadRequestException('shopId is required for shop roles');
    }
    this.assertKeysMatchScope(input.permissions, input.scope);

    return this.prisma.role.create({
      data: {
        name: input.name.trim(),
        description: input.description,
        scope: input.scope,
        shopId: input.scope === 'SHOP' ? input.shopId : null,
        isSystem: false,
        isPrivileged: false,
        permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
      },
      include: { permissions: true },
    });
  }

  /**
   * Clone a role that is *visible in the caller's scope* into an editable role.
   *
   * Visibility matters as much as permission here: `rbac.manage` is granted per
   * shop, so without the tenancy check below, shop A could name shop B's role id
   * and read its permission set into its own console.
   */
  async clone(roleId: string, opts: { name?: string; shopId?: string }) {
    const source = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
    if (!source) throw new NotFoundException('Role not found');
    this.assertVisibleInScope(source, opts.shopId);

    const shopId = source.scope === 'SHOP' ? opts.shopId ?? source.shopId ?? undefined : undefined;
    if (source.scope === 'SHOP' && !shopId) {
      throw new BadRequestException('shopId is required to clone a shop role');
    }

    return this.prisma.role.create({
      data: {
        name: (opts.name ?? `${source.name} (copy)`).trim(),
        description: source.description,
        scope: source.scope,
        shopId: shopId ?? null,
        isSystem: false,
        isPrivileged: false, // a clone never inherits privileged/god status
        permissions: { create: source.permissions.map((p) => ({ permissionKey: p.permissionKey })) },
      },
      include: { permissions: true },
    });
  }

  async update(
    roleId: string,
    patch: { name?: string; description?: string; permissions?: string[] },
    scopeShopId?: string,
  ) {
    const role = await this.mustBeEditable(roleId, scopeShopId);

    if (patch.permissions) {
      this.assertKeysMatchScope(patch.permissions, role.scope);
    }

    return this.prisma.$transaction(async (tx) => {
      if (patch.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: patch.permissions.map((permissionKey) => ({ roleId, permissionKey })),
        });
      }
      return tx.role.update({
        where: { id: roleId },
        data: {
          name: patch.name?.trim(),
          description: patch.description,
        },
        include: { permissions: true },
      });
    });
  }

  async remove(roleId: string, scopeShopId?: string) {
    const role = await this.mustBeEditable(roleId, scopeShopId);
    const memberCount =
      role.scope === 'SHOP'
        ? await this.prisma.shopMembership.count({ where: { roleId } })
        : await this.prisma.platformMembership.count({ where: { roleId } });
    if (memberCount > 0) {
      throw new BadRequestException(
        'Reassign the members of this role before deleting it.',
      );
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    return { deleted: true };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * Tenancy gate. `rbac.manage` is a per-shop grant, so holding it for shop A
   * must not reach a role belonging to shop B. System templates (`shopId: null`)
   * are shared and readable by every shop, which is why they are allowed through
   * — `mustBeEditable` then refuses to modify them.
   */
  private assertVisibleInScope(
    role: { scope: string; shopId: string | null },
    scopeShopId?: string,
  ) {
    if (role.scope !== 'SHOP') {
      if (scopeShopId) throw new NotFoundException('Role not found');
      return;
    }
    if (!scopeShopId) throw new BadRequestException('shopId is required for shop roles');
    if (role.shopId !== null && role.shopId !== scopeShopId) {
      // deliberately "not found", so the id space of other shops stays opaque
      throw new NotFoundException('Role not found');
    }
  }

  private async mustBeEditable(roleId: string, scopeShopId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    this.assertVisibleInScope(role, scopeShopId);
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be edited — clone it first.');
    }
    if (role.isPrivileged) {
      throw new ForbiddenException('Privileged roles cannot be edited.');
    }
    return role;
  }

  private assertKeysMatchScope(keys: string[], scope: PermScope) {
    const valid = new Set(ALL_PERMISSIONS.map((p) => p.key));
    for (const k of keys) {
      if (!valid.has(k)) throw new BadRequestException(`Unknown permission: ${k}`);
      if (PERMISSION_SCOPE[k] !== scope) {
        throw new BadRequestException(`Permission ${k} is not a ${scope} permission`);
      }
    }
  }
}
