import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EVENTS, OrderStatusChangedEvent } from '../../common/events';
import { LoyaltyService, pointsForSpend } from './loyalty.service';

/**
 * Accrues loyalty points when an order is delivered. Idempotency is guarded by
 * checking for an existing earn transaction for the order, so replayed events
 * never double-credit.
 */
@Injectable()
export class LoyaltyListener {
  private readonly logger = new Logger(LoyaltyListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  @OnEvent(EVENTS.ORDER_STATUS_CHANGED, { async: true })
  async onOrderStatus(e: OrderStatusChangedEvent): Promise<void> {
    if (e.to !== 'DELIVERED') return;
    const existing = await this.prisma.loyaltyTransaction.findFirst({
      where: { orderId: e.orderId, reason: 'Order delivered' },
      select: { id: true },
    });
    if (existing) return;

    const order = await this.prisma.order.findUnique({ where: { id: e.orderId }, select: { total: true } });
    if (!order) return;
    const points = pointsForSpend(order.total);
    if (points <= 0) return;

    await this.loyalty.award(e.customerId, points, 'Order delivered', e.orderId);
    this.logger.log(`Awarded ${points} pts to ${e.customerId} for order ${e.code}`);
  }
}
