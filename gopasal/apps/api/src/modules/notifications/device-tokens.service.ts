import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Which phones to push to, and when to stop.
 *
 * The app registers on every launch rather than once at install: a push token
 * is rotated by the OS, by a reinstall and by a restore from backup, and an app
 * that registers once ends up addressing a token nobody holds. Re-registering
 * the same token is an update, not a new row — hence the unique index.
 *
 * Two rules that matter more than they look:
 *
 *  - **A token belongs to whoever last presented it.** Phones get handed on and
 *    shared. Registering moves the row to the current user, so the previous
 *    owner's order updates stop arriving on it. That is the only safe reading.
 *  - **Signing out disables the token.** Not deletes: the row records that we
 *    deliberately stopped, which is the difference support needs when somebody
 *    says they no longer get notifications.
 */
@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger('DeviceTokens');

  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    input: { token: string; platform: string; appVersion?: string },
  ) {
    const row = await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        appVersion: input.appVersion,
      },
      update: {
        // The handed-on-phone case: the row follows the person signed in now.
        userId,
        platform: input.platform,
        appVersion: input.appVersion,
        lastSeenAt: new Date(),
        disabledAt: null,
        disabledReason: null,
      },
      select: { id: true, platform: true, lastSeenAt: true },
    });
    return { registered: true as const, ...row };
  }

  /** Sign-out, or the customer turning notifications off in the OS. */
  async forget(userId: string, token: string) {
    const { count } = await this.prisma.deviceToken.updateMany({
      where: { token, userId, disabledAt: null },
      data: { disabledAt: new Date(), disabledReason: 'signed out' },
    });
    return { forgotten: count > 0 };
  }

  /** The worker's lookup: live tokens for one person. */
  async liveTokensFor(userId: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId, disabledAt: null },
      select: { token: true },
      // A person with a drawer of old phones should not turn one notification
      // into twenty sends; the most recently seen handful is what they carry.
      orderBy: { lastSeenAt: 'desc' },
      take: 10,
    });
    return rows.map((r) => r.token);
  }

  /**
   * The push service told us these are gone. Believe it — continuing to send
   * to a dead token is how a project gets rate-limited.
   */
  async disable(tokens: string[], reason = 'unregistered with the push service') {
    if (tokens.length === 0) return;
    const { count } = await this.prisma.deviceToken.updateMany({
      where: { token: { in: tokens }, disabledAt: null },
      data: { disabledAt: new Date(), disabledReason: reason },
    });
    if (count > 0) this.logger.log(`disabled ${count} dead device token(s)`);
  }
}
