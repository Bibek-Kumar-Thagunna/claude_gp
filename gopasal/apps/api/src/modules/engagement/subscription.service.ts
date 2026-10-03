import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * GoPasal Gold membership. A single subscription per user (model enforces
 * userId unique). Activation must be payment-backed; the previous endpoint
 * granted Gold immediately without collecting or verifying any payment.
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

  subscribe(_userId: string, _plan = 'gold'): Promise<never> {
    return Promise.reject(new ServiceUnavailableException(
      'GoPasal Gold enrollment is unavailable until subscription billing and renewal verification are connected.',
    ));
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
