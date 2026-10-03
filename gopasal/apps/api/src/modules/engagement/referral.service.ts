import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReferralStatus } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LoyaltyService } from "./loyalty.service";

const codeGen = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 7);

export const COINS_PER_RUPEE = 10;
export const REFERRER_REWARD = 200;
export const REFEREE_REWARD = 100;

/**
 * A claim is recorded before a new customer's first order, but no value is
 * issued until that order is delivered. Qualification and both ledger credits
 * join the delivery transaction, so retries cannot double-credit either side.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async myCode(userId: string) {
    const code = await this.stableCode(userId);
    const [pending, rewarded] = await Promise.all([
      this.prisma.referral.count({
        where: { referrerId: userId, refereeId: { not: null }, status: ReferralStatus.PENDING },
      }),
      this.prisma.referral.count({
        where: { referrerId: userId, refereeId: { not: null }, status: ReferralStatus.REWARDED },
      }),
    ]);
    return {
      code,
      pending,
      rewarded,
      rewardPerReferral: REFERRER_REWARD,
      rewardValueRupees: REFERRER_REWARD / COINS_PER_RUPEE,
      coinsPerRupee: COINS_PER_RUPEE,
      qualification: "Rewarded after the invited customer receives their first order",
    };
  }

  async list(userId: string) {
    return this.prisma.referral.findMany({
      where: { referrerId: userId, refereeId: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { referee: { select: { name: true } } },
    });
  }

  async redeem(refereeId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, status: true },
    });
    if (!referrer || referrer.status !== "ACTIVE")
      throw new NotFoundException("Invalid referral code");
    if (referrer.id === refereeId) throw new BadRequestException("You cannot refer yourself");

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [already, priorOrders] = await Promise.all([
          tx.referral.findUnique({ where: { refereeId }, select: { id: true } }),
          tx.order.count({ where: { customerId: refereeId } }),
        ]);
        if (already) throw new BadRequestException("You have already used a referral code");
        if (priorOrders > 0)
          throw new BadRequestException("Referral codes must be claimed before your first order");

        const record = await tx.referral.create({
          data: {
            referrerId: referrer.id,
            refereeId,
            code: `${code}-${codeGen().slice(0, 4)}`,
            status: ReferralStatus.PENDING,
            referrerReward: REFERRER_REWARD,
            refereeReward: REFEREE_REWARD,
          },
        });
        return {
          referred: true,
          status: record.status,
          pendingCoins: REFEREE_REWARD,
          pendingValueRupees: REFEREE_REWARD / COINS_PER_RUPEE,
          message: "Your reward unlocks after your first order is delivered.",
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("You have already used a referral code");
      }
      throw error;
    }
  }

  async qualifyDeliveredOrder(
    tx: Prisma.TransactionClient,
    customerId: string,
    orderId: string,
  ): Promise<boolean> {
    const referral = await tx.referral.findUnique({ where: { refereeId: customerId } });
    if (!referral || referral.status !== ReferralStatus.PENDING || referral.rewardGranted)
      return false;

    const claim = await tx.referral.updateMany({
      where: {
        id: referral.id,
        status: ReferralStatus.PENDING,
        rewardGranted: false,
        qualifiedOrderId: null,
      },
      data: {
        status: ReferralStatus.COMPLETED,
        qualifiedOrderId: orderId,
        qualifiedAt: new Date(),
      },
    });
    if (claim.count !== 1) return false;

    await this.loyalty.award(
      referral.referrerId,
      referral.referrerReward || REFERRER_REWARD,
      "Referral reward",
      orderId,
      tx,
    );
    await this.loyalty.award(
      customerId,
      referral.refereeReward || REFEREE_REWARD,
      "Welcome referral reward",
      orderId,
      tx,
    );
    await tx.referral.update({
      where: { id: referral.id },
      data: { status: ReferralStatus.REWARDED, rewardGranted: true, rewardedAt: new Date() },
    });
    return true;
  }

  private async stableCode(userId: string): Promise<string> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!existing) throw new NotFoundException("User not found");
    if (existing.referralCode) return existing.referralCode;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = `GP-${codeGen()}`;
      try {
        await this.prisma.user.updateMany({
          where: { id: userId, referralCode: null },
          data: { referralCode: candidate },
        });
        const stored = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { referralCode: true },
        });
        if (stored.referralCode) return stored.referralCode;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
          throw error;
      }
    }
    throw new Error("Could not allocate a referral code");
  }
}
