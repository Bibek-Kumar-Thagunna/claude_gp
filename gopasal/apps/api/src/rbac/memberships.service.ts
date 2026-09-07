import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeNepalPhone } from '../auth/auth.service';

/**
 * Staff/membership administration for both scopes:
 *  - SHOP: a shop's team (ShopMembership) — assign a role, suspend, remove.
 *    Owner (privileged) memberships are protected from edits through this
 *    surface to prevent lockout.
 *  - PLATFORM: platform staff (PlatformMembership, one role per user).
 *
 * Note what is *not* here any more: creating access. A membership used to be
 * conjured from a phone number, active immediately, with nobody told about it.
 * Access now arrives only through InvitesModule, so every account can be traced
 * to an invitation somebody accepted from a phone they control.
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Shop staff ─────────────────────────────────────────────────────────
  /**
   * Every membership in one shop, oldest first. **Deliberately unpaginated.**
   *
   * The other seller reads — orders, products, reviews, coupons — were given
   * `?page&limit&q&status&sort` because each of them grows with *trade*: one row
   * per order a customer places, one per review a customer writes, one per code a
   * festival calls for, and nothing prunes any of them. A shop that keeps selling
   * accumulates those rows for as long as it exists, so an unbounded read there is
   * a query that gets slower every day it is not fixed.
   *
   * `ShopMembership` is not that kind of table. A row appears only when a human
   * accepts an invitation that another human sent to a phone number they control
   * (`InvitesModule` — there is no route that inserts a membership directly), and
   * it is *prunable*: `setStatus` suspends and `removeStaff` deletes for real.
   * The ceiling is therefore the number of people a shopkeeper has chosen to hand
   * keys to, which is a staffing decision, not a function of volume — tens at the
   * outside, and a shop with a hundred of them has a governance problem that
   * pagination would hide rather than solve.
   *
   * So this is case (B) of the pagination audit: the dataset is bounded by an act
   * of administration. Paginating it would buy nothing and cost the team screen the
   * one thing it genuinely needs — a complete roster, so "who can accept orders
   * here?" is answered by what is on the page rather than by page 2. The console
   * searches these rows in the browser for the same reason (see
   * `web-seller/lib/team-view.ts#matchesMember`): filtering a list you already hold
   * in full is not a shortcut, it is the correct implementation.
   *
   * The neighbouring invite read is bounded a different way: `InvitesService.list`
   * defaults to `status: 'PENDING'` and carries `take: 200`, because invites are
   * *not* pruned — a revoked or expired one stays as history.
   *
   * If this ever needs revisiting, the trigger is a real one: a shop model that
   * lets memberships be created without a person accepting them (bulk import,
   * SSO provisioning, franchise rollout). Until such a route exists, the row count
   * cannot run away.
   */
  listStaff(shopId: string) {
    return this.prisma.shopMembership.findMany({
      where: { shopId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, phone: true, status: true } },
        role: { select: { id: true, name: true, isPrivileged: true } },
      },
    });
  }

  async changeRole(shopId: string, membershipId: string, roleId: string) {
    const membership = await this.loadShopMembership(shopId, membershipId);
    if (membership.role.isPrivileged) throw new BadRequestException('The owner’s role cannot be changed');
    const role = await this.assertShopRole(shopId, roleId);
    if (role.isPrivileged) throw new BadRequestException('Cannot promote staff to Owner');
    return this.prisma.shopMembership.update({ where: { id: membershipId }, data: { roleId } });
  }

  async setStatus(shopId: string, membershipId: string, status: MembershipStatus) {
    const membership = await this.loadShopMembership(shopId, membershipId);
    if (membership.role.isPrivileged) throw new BadRequestException('The owner cannot be suspended');
    return this.prisma.shopMembership.update({ where: { id: membershipId }, data: { status } });
  }

  async removeStaff(shopId: string, membershipId: string) {
    const membership = await this.loadShopMembership(shopId, membershipId);
    if (membership.role.isPrivileged) throw new BadRequestException('The owner cannot be removed');
    await this.prisma.shopMembership.delete({ where: { id: membershipId } });
    return { removed: true };
  }

  // ── Platform staff ─────────────────────────────────────────────────────
  /**
   * Unpaginated for the same reason as {@link listStaff}, more strongly: platform
   * staff are GoPasal's own employees, one `PlatformMembership` per user, granted
   * out of band or by invitation. This one has not been audited as part of the
   * seller hardening pass — it is listed here so the next reader knows the
   * decision was inherited, not made.
   */
  listPlatformStaff() {
    return this.prisma.platformMembership.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, phone: true, status: true } },
        role: { select: { id: true, name: true, isPrivileged: true } },
      },
    });
  }

  /**
   * Change an *existing* platform staff member's role. It deliberately refuses
   * unknown phone numbers: silently creating an account nobody was told about is
   * how you end up with dormant admin access. New colleagues come in through
   * `POST /admin/staff/invites`.
   */
  async assignPlatform(phone: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.scope !== 'PLATFORM') throw new BadRequestException('Not a platform role');
    // Without this, `rbac.platform.manage` would be equivalent to Super Admin:
    // any operations admin could grant the privileged role to their own phone.
    // Super Admin is deliberately only grantable out of band (seed / migration).
    if (role.isPrivileged) {
      throw new BadRequestException(
        'The Super Admin role cannot be granted from the console. Provision it directly.',
      );
    }
    const normalized = normalizeNepalPhone(phone);

    const user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    if (!user) {
      throw new BadRequestException(
        'No GoPasal account uses this number yet. Send them an invitation instead — they will get a link and a code by SMS.',
      );
    }

    // Nor may this surface *demote* a Super Admin — that is the same escalation
    // read backwards (remove the only person who can stop you).
    const current = await this.prisma.platformMembership.findUnique({
      where: { userId: user.id },
      include: { role: { select: { isPrivileged: true } } },
    });
    if (current?.role.isPrivileged) {
      throw new BadRequestException('A Super Admin’s role cannot be changed here.');
    }
    if (!current) {
      throw new BadRequestException(
        'This person is not platform staff yet. Send them an invitation to the admin console first.',
      );
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { isPlatformStaff: true } });
    return this.prisma.platformMembership.update({
      where: { userId: user.id },
      data: { roleId },
      include: { user: { select: { name: true, phone: true } }, role: { select: { name: true } } },
    });
  }

  async removePlatform(userId: string) {
    const membership = await this.prisma.platformMembership.findUnique({ where: { userId }, include: { role: true } });
    if (!membership) throw new NotFoundException('Not a platform staff member');
    if (membership.role.isPrivileged) throw new BadRequestException('Cannot remove a Super Admin here');
    await this.prisma.$transaction([
      this.prisma.platformMembership.delete({ where: { userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { isPlatformStaff: false } }),
    ]);
    return { removed: true };
  }

  // ── helpers ────────────────────────────────────────────────────────────
  /**
   * The role must be assignable in this shop: a SHOP-scoped role that is either
   * global (`shopId` null — the seeded Manager, Order Handler and so on) or this
   * shop's own clone.
   *
   * Both failures answer `404 "Role not found"`. The previous pair of 400s —
   * "Not a shop role" and "Role belongs to another shop" — told the caller whether a
   * given id was a real PLATFORM role or a real role in a rival's shop, which is a
   * usable map of the platform's role table for anyone who can invite one staff
   * member. There is nothing a legitimate console can do with the distinction: the
   * role picker only ever offers ids that `listAssignable` returned.
   */
  private async assertShopRole(shopId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.scope !== 'SHOP') throw new NotFoundException('Role not found');
    if (role.shopId && role.shopId !== shopId) throw new NotFoundException('Role not found');
    return role;
  }

  private async loadShopMembership(shopId: string, membershipId: string) {
    const membership = await this.prisma.shopMembership.findUnique({
      where: { id: membershipId },
      include: { role: true },
    });
    if (!membership || membership.shopId !== shopId) throw new NotFoundException('Team member not found');
    return membership;
  }
}
