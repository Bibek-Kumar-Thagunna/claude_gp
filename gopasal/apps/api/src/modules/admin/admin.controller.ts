import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShopStatus } from '@prisma/client';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { ModerateProductDto, ShopLifecycleReasonDto } from './dto/admin.dto';

/**
 * Core platform admin surface (admin.gopasal.com): shop approvals, user
 * management, catalog moderation, analytics and the audit trail. Every route is
 * PLATFORM-scoped RBAC; mutations are recorded to the audit log.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  // ── Dashboard / analytics ──────────────────────────────────────────────
  @Get('overview')
  @RequirePermissions('admin.dashboard.view')
  @ApiOperation({ summary: 'Headline KPIs for the admin dashboard' })
  overview() {
    return this.admin.overview();
  }

  @Get('analytics/orders-trend')
  @RequirePermissions('analytics.platform.view')
  ordersTrend(@Query('days') days?: string) {
    return this.admin.ordersTrend(days ? Number(days) : 14);
  }

  // ── Shops ──────────────────────────────────────────────────────────────
  @Get('shops')
  @RequirePermissions('shops.view')
  @ApiOperation({ summary: 'List shops (optional ?status=PENDING and ?q=)' })
  listShops(@Query('status') status?: ShopStatus, @Query('q') q?: string) {
    return this.admin.listShops(status, q);
  }

  @Get('shops/:shopId')
  @RequirePermissions('shops.view')
  getShop(@Param('shopId') shopId: string) {
    return this.admin.getShop(shopId);
  }

  @Post('shops/:shopId/approve')
  @RequirePermissions('shops.approve')
  @Audit('shop.approve', 'Shop', 'shopId')
  approveShop(@Param('shopId') shopId: string) {
    return this.admin.approveShop(shopId);
  }

  @Post('shops/:shopId/reject')
  @RequirePermissions('shops.reject')
  @Audit('shop.reject', 'Shop', 'shopId')
  rejectShop(@Param('shopId') shopId: string, @Body() dto: ShopLifecycleReasonDto) {
    return this.admin.rejectShop(shopId, dto.reason);
  }

  @Post('shops/:shopId/suspend')
  @RequirePermissions('shops.suspend')
  @Audit('shop.suspend', 'Shop', 'shopId')
  suspendShop(@Param('shopId') shopId: string, @Body() dto: ShopLifecycleReasonDto) {
    return this.admin.suspendShop(shopId, dto.reason);
  }

  @Post('shops/:shopId/reactivate')
  @RequirePermissions('shops.suspend')
  @Audit('shop.reactivate', 'Shop', 'shopId')
  reactivateShop(@Param('shopId') shopId: string) {
    return this.admin.reactivateShop(shopId);
  }

  // ── Users ──────────────────────────────────────────────────────────────
  @Get('users')
  @RequirePermissions('users.view')
  listUsers(@Query('q') q?: string) {
    return this.admin.listUsers(q);
  }

  @Post('users/:userId/suspend')
  @RequirePermissions('users.suspend')
  @Audit('user.suspend', 'User', 'userId')
  suspendUser(@Param('userId') userId: string) {
    return this.admin.suspendUser(userId);
  }

  @Post('users/:userId/reactivate')
  @RequirePermissions('users.suspend')
  @Audit('user.reactivate', 'User', 'userId')
  reactivateUser(@Param('userId') userId: string) {
    return this.admin.reactivateUser(userId);
  }

  // ── Catalog moderation ───────────────────────────────────────────────────
  @Get('products')
  @RequirePermissions('catalog.moderate')
  @ApiOperation({ summary: 'Platform-wide product moderation queue' })
  listProducts(@Query('q') q?: string, @Query('active') active?: string) {
    return this.admin.listProducts(q, active === undefined ? undefined : active === 'true');
  }

  @Patch('products/:productId/moderate')
  @RequirePermissions('catalog.moderate')
  @Audit('catalog.moderate', 'Product', 'productId')
  @ApiOperation({ summary: 'Hide or restore a product platform-wide' })
  moderateProduct(@Param('productId') productId: string, @Body() dto: ModerateProductDto) {
    return this.admin.moderateProduct(productId, dto.isActive);
  }

  // ── Audit log ──────────────────────────────────────────────────────────
  @Get('audit')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Query the compliance audit log' })
  audit_(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.audit.list({ entityType, entityId, action, actorId, cursor });
  }
}
