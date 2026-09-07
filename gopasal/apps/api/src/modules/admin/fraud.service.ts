import { Injectable, NotFoundException } from '@nestjs/common';
import { FraudStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Fraud flags on users, shops or orders. Flags are raised by staff (or, later,
 * automated heuristics) and triaged through OPEN → REVIEWING → CONFIRMED /
 * DISMISSED. Enriched reads resolve the subject so the UI can link to it.
 */
@Injectable()
export class FraudService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: FraudStatus, subjectType?: string) {
    return this.prisma.fraudFlag.findMany({
      where: { status, subjectType },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      include: { reporter: { select: { name: true } } },
      take: 200,
    });
  }

  async get(flagId: string) {
    const flag = await this.prisma.fraudFlag.findUnique({ where: { id: flagId }, include: { reporter: { select: { name: true } } } });
    if (!flag) throw new NotFoundException('Flag not found');
    const subject = await this.resolveSubject(flag.subjectType, flag.subjectId);
    return { ...flag, subject };
  }

  raise(reporterId: string, input: { subjectType: string; subjectId: string; reason: string; severity?: string }) {
    return this.prisma.fraudFlag.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        reason: input.reason,
        severity: input.severity ?? 'medium',
        reporterId,
      },
    });
  }

  async setStatus(flagId: string, status: FraudStatus) {
    await this.get(flagId);
    return this.prisma.fraudFlag.update({ where: { id: flagId }, data: { status } });
  }

  private async resolveSubject(type: string, id: string) {
    if (type === 'user') return this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, phone: true, status: true } });
    if (type === 'shop') return this.prisma.shop.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (type === 'order') return this.prisma.order.findUnique({ where: { id }, select: { id: true, code: true, total: true, status: true } });
    return null;
  }
}
