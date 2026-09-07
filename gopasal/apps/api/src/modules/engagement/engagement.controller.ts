import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';
import { SubscriptionService } from './subscription.service';
import { RedeemReferralDto, SubscribeDto } from './dto/engagement.dto';

/** Customer engagement surface: loyalty balance, referrals, and GoPasal Gold. */
@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  // ── Loyalty ────────────────────────────────────────────────────────────
  @Get('loyalty')
  @ApiOperation({ summary: 'My points, tier and recent activity' })
  loyaltySummary(@CurrentUser('id') userId: string) {
    return this.loyalty.summary(userId);
  }

  @Get('loyalty/ledger')
  ledger(@CurrentUser('id') userId: string) {
    return this.loyalty.ledger(userId);
  }

  // ── Referrals ──────────────────────────────────────────────────────────
  @Get('referrals')
  @ApiOperation({ summary: 'My shareable referral code + history' })
  myReferrals(@CurrentUser('id') userId: string) {
    return this.referrals.myCode(userId);
  }

  @Get('referrals/history')
  referralHistory(@CurrentUser('id') userId: string) {
    return this.referrals.list(userId);
  }

  @Post('referrals/redeem')
  @ApiOperation({ summary: 'Redeem a friend’s referral code (new customers)' })
  redeem(@CurrentUser('id') userId: string, @Body() dto: RedeemReferralDto) {
    return this.referrals.redeem(userId, dto.code);
  }

  // ── GoPasal Gold ─────────────────────────────────────────────────────────
  @Get('gold')
  @ApiOperation({ summary: 'My GoPasal Gold membership status' })
  myGold(@CurrentUser('id') userId: string) {
    return this.subscriptions.mine(userId);
  }

  @Post('gold/subscribe')
  subscribe(@CurrentUser('id') userId: string, @Body() dto: SubscribeDto) {
    return this.subscriptions.subscribe(userId, dto.plan);
  }

  @Delete('gold')
  cancel(@CurrentUser('id') userId: string) {
    return this.subscriptions.cancel(userId);
  }
}
