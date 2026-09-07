import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics.dto';

/**
 * Seller analytics. Read-only: there is nothing here to write.
 *
 * Two routes, and the difference between them is authorisation, not arithmetic:
 *
 * - `shops/:shopId/analytics/overview` names a shop, so `PermissionsGuard` resolves it
 *   from the param and enforces `analytics.view` — including the lifecycle check that
 *   keeps a PENDING shop out.
 * - `analytics/overview` names none. A SHOP-scoped key with no shop context is an
 *   unconditional deny in the guard, so gating this route with `@RequirePermissions`
 *   would make it a 403 for everybody. It therefore carries none and the service does
 *   the filtering with the same `RbacService`, exactly as `GET /seller/shops` does.
 *   The route is still authenticated — `JwtAuthGuard` is global — and it can only ever
 *   return shops the caller is an ACTIVE member of.
 *
 * `analytics.view` is held by Owner and Manager only. Order Handler, Inventory Editor
 * and Support Staff hold `dashboard.view` but not this, so their console shows a
 * dashboard with the money cards absent rather than showing them at zero.
 */
@ApiTags('seller:analytics')
@ApiBearerAuth()
@Controller('seller')
export class AnalyticsSellerController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('shops/:shopId/analytics/overview')
  @RequirePermissions('analytics.view')
  overviewForShop(@Param('shopId') shopId: string, @Query() query: AnalyticsQueryDto) {
    return this.analytics.overviewForShop(shopId, query.period);
  }

  /** Consolidated "All shops" view. Deliberately not gated; see the class note. */
  @Get('analytics/overview')
  overviewForSeller(@CurrentUser('id') userId: string, @Query() query: AnalyticsQueryDto) {
    return this.analytics.overviewForSeller(userId, query.period);
  }
}
