import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';
import { SubscriptionService } from './subscription.service';
import { LoyaltyListener } from './loyalty.listener';
import { EngagementController } from './engagement.controller';

/**
 * Customer retention features: loyalty points (accrued on delivery via events),
 * referrals, and GoPasal Gold. Services are exported so orders/checkout can
 * apply Gold perks and read loyalty in future.
 */
@Module({
  controllers: [EngagementController],
  providers: [LoyaltyService, ReferralService, SubscriptionService, LoyaltyListener],
  exports: [LoyaltyService, ReferralService, SubscriptionService],
})
export class EngagementModule {}
