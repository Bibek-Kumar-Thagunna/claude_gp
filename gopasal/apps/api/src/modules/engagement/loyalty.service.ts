import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Points thresholds → tier. Ordered high to low for lookup. */
const TIERS: { name: string; min: number }[] = [
  { name: 'Platinum', min: 5000 },
  { name: 'Gold', min: 2000 },
  { name: 'Silver', min: 500 },
  { name: 'Bronze', min: 0 },
];

export function tierForPoints(points: number): string {
  return TIERS.find((t) => points >= t.min)!.name;
}

/** 1 loyalty point per Rs.100 spent (money is stored in paisa-free integer rupees). */
export function pointsForSpend(totalRupees: number): number {
  return Math.max(0, Math.floor(totalRupees / 100));
}

/**
 * GoPasal loyalty ledger. Every balance change is an immutable
 * LoyaltyTransaction; the account row is a denormalised running total + tier.
 * Award is transaction-aware so it can run inside a larger order transaction.
 */
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(userId: string) {
    const account = await this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return account;
  }

  async summary(userId: string) {
    const [account, recent] = await Promise.all([
      this.getAccount(userId),
      this.prisma.loyaltyTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
    ]);
    const next = TIERS.slice().reverse().find((t) => t.min > account.points);
    return {
      points: account.points,
      tier: account.tier,
      nextTier: next ? { name: next.name, pointsAway: next.min - account.points } : null,
      recent,
    };
  }

  ledger(userId: string) {
    return this.prisma.loyaltyTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /**
   * Credit/debit points. Pass a `tx` client to enrol in an outer transaction;
   * otherwise it runs its own. Recomputes tier from the resulting balance.
   */
  async award(
    userId: string,
    delta: number,
    reason: string,
    orderId?: string,
    client?: Prisma.TransactionClient,
  ) {
    const run = async (db: Prisma.TransactionClient) => {
      const account = await db.loyaltyAccount.upsert({ where: { userId }, create: { userId }, update: {} });
      const points = Math.max(0, account.points + delta);
      await db.loyaltyTransaction.create({ data: { userId, delta, reason, orderId } });
      return db.loyaltyAccount.update({
        where: { userId },
        data: { points, tier: tierForPoints(points) },
      });
    };
    return client ? run(client) : this.prisma.$transaction(run);
  }
}
