import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const RENEWAL_DAYS = 30;

/**
 * GoPasal Gold membership. A single subscription per user (model enforces
 * userId unique). Payment capture is a later addition — subscribe activates
 * immediately for now, with a placeholder renewal date so the UI can render it.
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  mine(userId: string) {
    return this.prisma.subscription.findUnique({ where: { userId } });
  }

  async isGold(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub || sub.status !== 'ACTIVE') return false;
    return !sub.renewsAt || sub.renewsAt > new Date();
  }

  async subscribe(userId: string, plan = 'gold') {
    const renewsAt = new Date(Date.now() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan, status: 'ACTIVE', renewsAt },
      update: { plan, status: 'ACTIVE', renewsAt, cancelledAt: null },
    });
  }

  async cancel(userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub || sub.status !== 'ACTIVE') throw new BadRequestException('No active membership to cancel');
    return this.prisma.subscription.update({
      where: { userId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }
}
