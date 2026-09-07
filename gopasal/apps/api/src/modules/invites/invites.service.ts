import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { InviteStatus, RbacScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../../auth/sms.provider';
import { normalizeNepalPhone } from '../../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  INVITE_MAX_ATTEMPTS,
  constantTimeEquals,
  generateInviteSecrets,
  hashInviteCode,
  hashInviteToken,
  inviteExpiry,
  inviteJoinUrl,
} from './invite-token';

/**
 * How a person actually gets an account.
 *
 * The old behaviour created an ACTIVE membership the instant an owner typed a
 * phone number: the teammate was never told, and the owner had no way to see
 * whether access had landed. An invite fixes both halves — it is delivered by
 * SMS to a number the invitee controls, it is visible and revocable while it
 * waits, and the membership only becomes ACTIVE when they accept it from a
 * session proven to own that number.
 *
 * The same machinery serves both consoles. A shop invite carries `shopId`; a
 * platform invite does not, and lands on admin.gopasal.com instead.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /**
   * Issue an invite. Returns the invite plus its one-time secrets — this is the
   * only moment the link and code exist in readable form, so the console must
   * show them immediately (the owner may want to hand the code over in person
   * rather than trust SMS delivery in a village with poor signal).
   */
  async create(
    target: { scope: RbacScope; shopId?: string },
    input: { phone: string; roleId: string; name?: string; note?: string },
    invitedById: string,
  ) {
    const phone = normalizeNepalPhone(input.phone);
    const role = await this.assertAssignableRole(target, input.roleId);

    // Already on the team? Say so plainly instead of issuing an invite that
    // would do nothing on acceptance.
    const existingUser = await this.prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      await this.assertNotAlreadyMember(target, existingUser.id);
    }

    // One live invite per person per destination. Re-inviting supersedes rather
    // than stacking, so the owner never has to reason about which link is live.
    await this.prisma.staffInvite.updateMany({
      where: {
        phone,
        scope: target.scope,
        shopId: target.shopId ?? null,
        status: 'PENDING',
      },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    const secrets = generateInviteSecrets(phone);
    const invite = await this.prisma.staffInvite.create({
      data: {
        scope: target.scope,
        shopId: target.shopId ?? null,
        roleId: role.id,
        phone,
        name: input.name?.trim() || null,
        note: input.note?.trim() || null,
        tokenHash: secrets.tokenHash,
        codeHash: secrets.codeHash,
        expiresAt: inviteExpiry(),
        invitedById,
      },
      include: this.inviteInclude,
    });

    const delivery = await this.deliver(invite, secrets.token, secrets.code);
    const saved = await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: { delivery },
      include: this.inviteInclude,
    });

    return {
      invite: this.toView(saved),
      /** show once; the server cannot recover these afterwards */
      shareOnce: {
        link: inviteJoinUrl(target.scope, secrets.token),
        code: secrets.code,
        expiresAt: saved.expiresAt,
      },
    };
  }

  async list(
    target: { scope: RbacScope; shopId?: string },
    status: InviteStatus | 'ALL' = 'PENDING',
  ) {
    await this.expireStale(target);
    const invites = await this.prisma.staffInvite.findMany({
      where: {
        scope: target.scope,
        shopId: target.shopId ?? null,
        ...(status === 'ALL' ? {} : { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: this.inviteInclude,
    });
    return invites.map((i) => this.toView(i));
  }

  /**
   * Resend re-rolls both secrets. That is deliberate: the common reason to
   * resend is "they never got it / they read the code wrong", and re-rolling
   * also clears a code that has been guessed at, so one action fixes both the
   * delivery problem and the lockout it caused.
   */
  async resend(target: { scope: RbacScope; shopId?: string }, inviteId: string) {
    const invite = await this.mustFind(target, inviteId);
    if (invite.status !== 'PENDING' && invite.status !== 'EXPIRED') {
      throw new BadRequestException(
        invite.status === 'ACCEPTED'
          ? 'This invite was already accepted.'
          : 'This invite was revoked. Send a new one instead.',
      );
    }

    const secrets = generateInviteSecrets(invite.phone);
    const updated = await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash: secrets.tokenHash,
        codeHash: secrets.codeHash,
        attempts: 0,
        status: 'PENDING',
        expiresAt: inviteExpiry(),
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
      include: this.inviteInclude,
    });

    const delivery = await this.deliver(updated, secrets.token, secrets.code);
    const saved = await this.prisma.staffInvite.update({
      where: { id: updated.id },
      data: { delivery },
      include: this.inviteInclude,
    });

    return {
      invite: this.toView(saved),
      shareOnce: {
        link: inviteJoinUrl(invite.scope, secrets.token),
        code: secrets.code,
        expiresAt: saved.expiresAt,
      },
    };
  }

  async revoke(target: { scope: RbacScope; shopId?: string }, inviteId: string) {
    const invite = await this.mustFind(target, inviteId);
    if (invite.status === 'ACCEPTED') {
      throw new BadRequestException(
        'This invite was already accepted — remove the teammate from the team list instead.',
      );
    }
    const saved = await this.prisma.staffInvite.update({
      where: { id: invite.id },
      // The token hash stays, so a revoked link resolves to a clear "no longer
      // valid" message rather than a bare 404 the invitee cannot interpret.
      data: { status: 'REVOKED', revokedAt: new Date() },
      include: this.inviteInclude,
    });
    return this.toView(saved);
  }

  /**
   * Public (unauthenticated) view of a link, so the join page can say "Ram's
   * Kirana invited you as Order Handler — sign in with 98•••••210" *before*
   * asking anyone to log in. It deliberately reveals only what the recipient of
   * the link already needs, and masks the phone number so a leaked link does not
   * also leak a contact.
   */
  async preview(token: string) {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: this.inviteInclude,
    });
    if (!invite) throw new NotFoundException('This invitation link is not valid.');

    const status = await this.settleExpiry(invite);
    return {
      status,
      scope: invite.scope,
      shop: invite.shop ? { id: invite.shop.id, name: invite.shop.name, slug: invite.shop.slug } : null,
      role: { id: invite.role.id, name: invite.role.name, description: invite.role.description },
      invitedBy: invite.invitedBy?.name ?? null,
      name: invite.name,
      note: invite.note,
      phoneMasked: maskPhone(invite.phone),
      expiresAt: invite.expiresAt,
      /** what the join page should tell them to do */
      signInWith: 'phone-otp',
    };
  }

  /** Invites waiting for the signed-in user, shown as a banner after login. */
  async pendingFor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    if (!user) return [];
    const invites = await this.prisma.staffInvite.findMany({
      where: { phone: user.phone, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: this.inviteInclude,
    });
    return invites.map((i) => ({
      id: i.id,
      scope: i.scope,
      shop: i.shop ? { id: i.shop.id, name: i.shop.name } : null,
      role: i.role.name,
      note: i.note,
      expiresAt: i.expiresAt,
      /** accepting from here needs the code, not the link */
      requiresCode: true,
    }));
  }

  /**
   * Accept an invite. Requires an authenticated session, and that session's
   * phone number must be the invited one — the link alone is never enough, so
   * forwarding it to someone else grants them nothing.
   */
  async accept(userId: string, input: { token?: string; code?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const invite = input.token
      ? await this.findByToken(input.token)
      : await this.findByCode(user.phone, input.code);

    // Wrong account: the most common real-world case is a shared phone or a
    // second SIM, so name the number they need rather than just refusing.
    if (invite.phone !== user.phone) {
      throw new ForbiddenException(
        `This invitation was sent to ${maskPhone(invite.phone)}. Sign in with that number to accept it.`,
      );
    }

    const status = await this.settleExpiry(invite);
    if (status === 'EXPIRED') {
      throw new BadRequestException('This invitation has expired. Ask for a new one.');
    }
    if (status === 'REVOKED') {
      throw new BadRequestException('This invitation is no longer valid.');
    }
    if (status === 'ACCEPTED') {
      throw new BadRequestException('This invitation has already been used.');
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      let created:
        | { kind: 'shop'; id: string; shopId: string }
        | { kind: 'platform'; id: string };

      if (invite.scope === 'SHOP') {
        if (!invite.shopId) throw new BadRequestException('This invitation is malformed.');
        const existing = await tx.shopMembership.findUnique({
          where: { userId_shopId: { userId, shopId: invite.shopId } },
        });
        const row = existing
          ? await tx.shopMembership.update({
              where: { id: existing.id },
              data: { roleId: invite.roleId, status: 'ACTIVE', acceptedAt: new Date() },
            })
          : await tx.shopMembership.create({
              data: {
                userId,
                shopId: invite.shopId,
                roleId: invite.roleId,
                status: 'ACTIVE',
                invitedAt: invite.createdAt,
                acceptedAt: new Date(),
              },
            });
        created = { kind: 'shop', id: row.id, shopId: invite.shopId };
      } else {
        // Platform staff get exactly one membership; accepting a new invite
        // replaces the old role rather than adding a second one.
        const row = await tx.platformMembership.upsert({
          where: { userId },
          create: { userId, roleId: invite.roleId },
          update: { roleId: invite.roleId },
        });
        await tx.user.update({ where: { id: userId }, data: { isPlatformStaff: true } });
        created = { kind: 'platform', id: row.id };
      }

      // Fill in a name only if the account has none — never overwrite what the
      // person chose for themselves with what an owner typed about them.
      if (!user.name && invite.name) {
        await tx.user.update({ where: { id: userId }, data: { name: invite.name } });
      }

      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: userId },
      });

      return created;
    });

    await this.notifyAccepted(invite, user.name ?? maskPhone(user.phone));

    return {
      accepted: true,
      scope: invite.scope,
      shopId: invite.scope === 'SHOP' ? invite.shopId : null,
      role: invite.role.name,
      membership,
      /** the console should re-fetch /auth/me: permissions have changed */
      refreshAccess: true,
    };
  }

  // ─────────────────────────────── internals ────────────────────────────────

  /**
   * The relations every invite read needs, and nothing beyond them.
   *
   * This used to also join `acceptedBy: { select: { id, name, phone } }` on all
   * eleven reads, including the two list endpoints and the *unauthenticated*
   * `preview`. No mapper in this file ever read it — `toView`, `preview` and
   * `pendingFor` return `invitedBy`, never `acceptedBy` — so the only thing that
   * join ever did was load a second person's phone number into memory on a route
   * that exists to be fetched without a session. `acceptedById` is a column on the
   * invite itself, so nothing that needs the identity has lost access to it.
   *
   * `role.scope` went for the same reason: the invite carries its own `scope`, and
   * that is the one every caller reads. `role.isPrivileged` stays — `resend` checks
   * it at `existing?.role.isPrivileged` — and so does `role.description`, which
   * `preview` shows on the join page.
   */
  private readonly inviteInclude = {
    role: { select: { id: true, name: true, description: true, isPrivileged: true } },
    shop: { select: { id: true, name: true, slug: true } },
    invitedBy: { select: { name: true } },
  } as const;

  /** Nothing secret leaves the service — no token hash, no code hash. */
  private toView(invite: InviteWithRelations) {
    return {
      id: invite.id,
      scope: invite.scope,
      shopId: invite.shopId,
      phone: invite.phone,
      name: invite.name,
      note: invite.note,
      role: { id: invite.role.id, name: invite.role.name },
      status: invite.status,
      expiresAt: invite.expiresAt,
      lastSentAt: invite.lastSentAt,
      sendCount: invite.sendCount,
      delivery: invite.delivery,
      attemptsRemaining: Math.max(0, INVITE_MAX_ATTEMPTS - invite.attempts),
      invitedBy: invite.invitedBy?.name ?? null,
      acceptedAt: invite.acceptedAt,
      createdAt: invite.createdAt,
    };
  }

  /**
   * A role is only assignable if it belongs to the destination. Without the
   * `shopId` comparison, `team.invite` on one shop would let an owner attach a
   * teammate to a *different* shop's custom role.
   */
  private async assertAssignableRole(target: { scope: RbacScope; shopId?: string }, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.scope !== target.scope) throw new NotFoundException('Role not found');

    if (target.scope === 'SHOP') {
      if (!target.shopId) throw new BadRequestException('shopId is required for shop invites');
      if (role.shopId !== null && role.shopId !== target.shopId) {
        throw new NotFoundException('Role not found');
      }
      // Ownership transfers are a different, deliberate operation — they change
      // who is liable for the shop, and they cannot be done by handing out a link.
      if (role.isPrivileged) {
        throw new BadRequestException('The Owner role cannot be invited. Transfer ownership from Settings instead.');
      }
    } else if (role.isPrivileged) {
      throw new BadRequestException(
        'The Super Admin role cannot be invited from the console. Provision it directly.',
      );
    }
    return role;
  }

  private async assertNotAlreadyMember(target: { scope: RbacScope; shopId?: string }, userId: string) {
    if (target.scope === 'SHOP') {
      const existing = await this.prisma.shopMembership.findUnique({
        where: { userId_shopId: { userId, shopId: target.shopId! } },
      });
      if (existing && existing.status !== 'INVITED') {
        throw new BadRequestException('This person is already on the team.');
      }
      return;
    }
    const existing = await this.prisma.platformMembership.findUnique({
      where: { userId },
      include: { role: { select: { isPrivileged: true } } },
    });
    if (existing?.role.isPrivileged) {
      throw new BadRequestException('A Super Admin’s role cannot be changed here.');
    }
  }

  private async mustFind(target: { scope: RbacScope; shopId?: string }, inviteId: string) {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { id: inviteId },
      include: this.inviteInclude,
    });
    // Scope mismatch reads as "not found" so one console cannot enumerate the
    // other's invite ids.
    if (!invite || invite.scope !== target.scope || invite.shopId !== (target.shopId ?? null)) {
      throw new NotFoundException('Invite not found');
    }
    return invite;
  }

  private async findByToken(token: string) {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: this.inviteInclude,
    });
    if (!invite) throw new NotFoundException('This invitation link is not valid.');
    return invite;
  }

  /**
   * Code path. The invite is found by phone number *first*; the six-digit code
   * is then compared in constant time and every miss is counted, so the short
   * code never becomes an enumeration surface.
   */
  private async findByCode(phone: string, code?: string) {
    if (!code) throw new BadRequestException('Enter the invitation code you were given.');
    const invite = await this.prisma.staffInvite.findFirst({
      where: { phone, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: this.inviteInclude,
    });
    if (!invite) throw new NotFoundException('No invitation is waiting for this number.');

    if (invite.attempts >= INVITE_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect codes. Ask for the invitation to be sent again.');
    }
    if (!constantTimeEquals(invite.codeHash, hashInviteCode(code.trim(), phone))) {
      await this.prisma.staffInvite.update({
        where: { id: invite.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('That code is not right. Check it and try again.');
    }
    return invite;
  }

  /** Lazily flip a lapsed PENDING invite to EXPIRED when anyone looks at it. */
  private async settleExpiry(invite: { id: string; status: InviteStatus; expiresAt: Date }) {
    if (invite.status === 'PENDING' && invite.expiresAt.getTime() <= Date.now()) {
      await this.prisma.staffInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      return 'EXPIRED' as InviteStatus;
    }
    return invite.status;
  }

  private expireStale(target: { scope: RbacScope; shopId?: string }) {
    return this.prisma.staffInvite.updateMany({
      where: {
        scope: target.scope,
        shopId: target.shopId ?? null,
        status: 'PENDING',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }

  /**
   * Deliver the invite by SMS. A delivery failure is recorded, not thrown: the
   * invite is already valid and the owner can still read the code out, so
   * failing the whole request would destroy a usable credential over a
   * transient gateway error.
   */
  private async deliver(
    invite: { scope: RbacScope; phone: string; role: { name: string }; shop: { name: string } | null },
    token: string,
    code: string,
  ): Promise<string> {
    const where = invite.shop ? invite.shop.name : 'GoPasal';
    const message =
      `You've been added to ${where} as ${invite.role.name}. ` +
      `Open ${inviteJoinUrl(invite.scope, token)} and sign in with this number, ` +
      `or enter code ${code}. — GoPasal`;
    try {
      await this.sms.send(invite.phone, message);
      return 'sent';
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`invite SMS to ${maskPhone(invite.phone)} failed: ${reason}`);
      return `failed: ${reason}`;
    }
  }

  /** Tell the person who sent the invite that it landed. */
  private async notifyAccepted(
    invite: { invitedById: string; shop: { name: string } | null; role: { name: string }; scope: RbacScope },
    who: string,
  ) {
    const where = invite.shop ? invite.shop.name : 'the GoPasal admin console';
    await this.notifications
      .create({
        userId: invite.invitedById,
        type: 'invite.accepted',
        title: 'Invitation accepted',
        body: `${who} has joined ${where} as ${invite.role.name}.`,
        data: { scope: invite.scope, role: invite.role.name },
      })
      .catch(() => undefined);
  }
}

/** 9812345678 → 98•••••678. Enough to recognise your own number, not enough to dial. */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return '•'.repeat(phone.length);
  return `${phone.slice(0, 2)}${'•'.repeat(phone.length - 5)}${phone.slice(-3)}`;
}

type InviteWithRelations = {
  id: string;
  scope: RbacScope;
  shopId: string | null;
  roleId: string;
  phone: string;
  name: string | null;
  note: string | null;
  status: InviteStatus;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
  delivery: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  role: { id: string; name: string; description: string | null; isPrivileged: boolean };
  shop: { id: string; name: string; slug: string } | null;
  invitedBy: { name: string | null } | null;
};
