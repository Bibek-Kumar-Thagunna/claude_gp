import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export const LOYALTY_POINTS_PER_RUPEE = 10;
const MAX_ORDER_CREDIT_SHARE = 0.2;

/** Points thresholds → tier. Ordered high to low for lookup. */
const TIERS: { name: string; min: number }[] = [
  { name: "Platinum", min: 5000 },
  { name: "Gold", min: 2000 },
  { name: "Silver", min: 500 },
  { name: "Bronze", min: 0 },
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
      this.prisma.loyaltyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);
    const next = TIERS.slice()
      .reverse()
      .find((t) => t.min > account.points);
    return {
      points: account.points,
      tier: account.tier,
      nextTier: next ? { name: next.name, pointsAway: next.min - account.points } : null,
      recent,
    };
  }

  ledger(userId: string) {
    return this.prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async redemptionQuote(userId: string, payableRupees: number) {
    const account = await this.getAccount(userId);
    return this.redemptionFromBalance(account.points, payableRupees);
  }

  async redeemForOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    orderId: string,
    payableRupees: number,
  ) {
    const account = await tx.loyaltyAccount.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const quote = this.redemptionFromBalance(account.points, payableRupees);
    if (quote.pointsUsed === 0) return quote;

    const debit = await tx.loyaltyAccount.updateMany({
      where: { userId, points: { gte: quote.pointsUsed } },
      data: { points: { decrement: quote.pointsUsed } },
    });
    if (debit.count !== 1) throw new Error("GoCoins balance changed during checkout");
    const remaining = account.points - quote.pointsUsed;
    await tx.loyaltyAccount.update({
      where: { userId },
      data: { tier: tierForPoints(remaining) },
    });
    await tx.loyaltyTransaction.create({
      data: { userId, delta: -quote.pointsUsed, reason: "GoCoins used", orderId },
    });
    return quote;
  }

  async restoreCancelledOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    orderId: string,
  ): Promise<void> {
    const [used, restored] = await Promise.all([
      tx.loyaltyTransaction.findUnique({
        where: { userId_orderId_reason: { userId, orderId, reason: "GoCoins used" } },
      }),
      tx.loyaltyTransaction.findUnique({
        where: { userId_orderId_reason: { userId, orderId, reason: "GoCoins returned" } },
      }),
    ]);
    if (!used || restored) return;
    await this.award(userId, Math.abs(used.delta), "GoCoins returned", orderId, tx);
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
      await db.loyaltyTransaction.create({ data: { userId, delta, reason, orderId } });
      const account = await db.loyaltyAccount.upsert({
        where: { userId },
        create: { userId, points: Math.max(0, delta), tier: tierForPoints(Math.max(0, delta)) },
        update: { points: { increment: delta } },
      });
      return db.loyaltyAccount.update({
        where: { userId },
        data: { tier: tierForPoints(account.points) },
      });
    };
    return client ? run(client) : this.prisma.$transaction(run);
  }

  private redemptionFromBalance(points: number, payableRupees: number) {
    const maximumRupees = Math.max(0, Math.floor(payableRupees * MAX_ORDER_CREDIT_SHARE));
    const discount = Math.min(Math.floor(points / LOYALTY_POINTS_PER_RUPEE), maximumRupees);
    return {
      balance: points,
      pointsUsed: discount * LOYALTY_POINTS_PER_RUPEE,
      discount,
      coinsPerRupee: LOYALTY_POINTS_PER_RUPEE,
      maxOrderShare: MAX_ORDER_CREDIT_SHARE,
    };
  }
}
