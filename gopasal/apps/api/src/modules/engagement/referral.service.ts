import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoyaltyService } from './loyalty.service';

const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 7);

/** Reward sizes (loyalty points) for a completed referral. */
const REFERRER_REWARD = 200;
const REFEREE_REWARD = 100;

/**
 * Referrals. Each user has ONE stable shareable code, stored on an "anchor"
 * Referral row (refereeId null). Redeeming the code creates a distinct
 * completed Referral row per new customer and grants loyalty to both sides.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** Get or lazily create the caller's shareable code. */
  async myCode(userId: string) {
    let anchor = await this.prisma.referral.findFirst({ where: { referrerId: userId, refereeId: null } });
    if (!anchor) {
      anchor = await this.prisma.referral.create({ data: { referrerId: userId, code: `GP-${codeGen()}` } });
    }
    const completed = await this.prisma.referral.count({
      where: { referrerId: userId, refereeId: { not: null } },
    });
    return { code: anchor.code, referrals: completed, rewardPerReferral: REFERRER_REWARD };
  }

  async list(userId: string) {
    return this.prisma.referral.findMany({
      where: { referrerId: userId, refereeId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: { referee: { select: { name: true } } },
    });
  }

  /**
   * A new customer redeems someone's code. Guards: code must exist, cannot
   * self-refer, and a customer may only be referred once (refereeId unique).
   */
  async redeem(refereeId: string, code: string) {
    const anchor = await this.prisma.referral.findUnique({ where: { code } });
    if (!anchor) throw new NotFoundException('Invalid referral code');
    if (anchor.referrerId === refereeId) throw new BadRequestException('You cannot refer yourself');

    const already = await this.prisma.referral.findUnique({ where: { refereeId } });
    if (already) throw new BadRequestException('You have already used a referral code');

    const record = await this.prisma.referral.create({
      data: {
        referrerId: anchor.referrerId,
        refereeId,
        code: `${anchor.code}-${codeGen().slice(0, 4)}`,
        status: 'REWARDED',
        rewardGranted: true,
      },
    });

    await Promise.all([
      this.loyalty.award(anchor.referrerId, REFERRER_REWARD, 'Referral reward', undefined),
      this.loyalty.award(refereeId, REFEREE_REWARD, 'Welcome referral bonus', undefined),
    ]);

    return { referred: true, youEarned: REFEREE_REWARD, record };
  }
}
