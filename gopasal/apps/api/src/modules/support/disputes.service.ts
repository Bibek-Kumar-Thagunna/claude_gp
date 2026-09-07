import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DisputeStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Order disputes. A customer can raise exactly one dispute per order (the model
 * enforces orderId unique). Platform staff review and resolve; resolution in
 * favour of the customer is where a future refund workflow would hook in.
 */
@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async raise(userId: string, orderId: string, input: { reason: string; detail?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, status: true, dispute: true },
    });
    if (!order || order.customerId !== userId) throw new NotFoundException('Order not found');
    if (order.dispute) throw new BadRequestException('A dispute is already open for this order');
    if (order.status === 'PLACED') throw new BadRequestException('Give the shop a chance to act before disputing');
    return this.prisma.dispute.create({
      data: { orderId, raisedById: userId, reason: input.reason, detail: input.detail },
    });
  }

  myDisputes(userId: string) {
    return this.prisma.dispute.findMany({
      where: { raisedById: userId },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { code: true, total: true, status: true } } },
    });
  }

  // ── Staff (admin surface) ────────────────────────────────────────────────
  listAll(status?: DisputeStatus) {
    return this.prisma.dispute.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      include: { order: { select: { code: true, total: true, shopId: true, customerId: true } } },
      take: 200,
    });
  }

  async get(disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: { include: { shop: { select: { name: true } }, items: true } } },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async resolve(adminId: string, disputeId: string, input: { status: DisputeStatus; resolution?: string }) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (['RESOLVED_CUSTOMER', 'RESOLVED_SHOP', 'REJECTED'].includes(dispute.status)) {
      throw new BadRequestException('This dispute is already closed');
    }
    return this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status: input.status, resolution: input.resolution, resolvedById: adminId },
    });
  }

  async setUnderReview(disputeId: string) {
    await this.get(disputeId);
    return this.prisma.dispute.update({ where: { id: disputeId }, data: { status: 'UNDER_REVIEW' } });
  }
}
