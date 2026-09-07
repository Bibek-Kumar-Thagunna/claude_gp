import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSellerController } from './analytics.seller.controller';

/**
 * Seller analytics. `PrismaModule` and `RbacModule` are both global, so this module
 * declares no imports of its own.
 *
 * The service is exported because a future admin or rider surface may want the same
 * shop-scoped numbers; nothing consumes it yet.
 */
@Module({
  controllers: [AnalyticsSellerController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
