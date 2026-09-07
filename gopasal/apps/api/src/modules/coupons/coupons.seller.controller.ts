import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, ListShopCouponsQueryDto, UpdateCouponDto } from './dto/coupons.dto';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';

/** Seller-managed, shop-scoped coupons. Platform-wide coupons are admin-managed. */
@ApiTags('seller:coupons')
@ApiBearerAuth()
@Controller('seller/shops/:shopId/coupons')
export class CouponsSellerController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions('promotions.view')
  @ApiOperation({ summary: 'One page of this shop’s coupons, with a shop-wide summary' })
  list(@Param('shopId') shopId: string, @Query() query: ListShopCouponsQueryDto) {
    return this.coupons.listForShopManage(shopId, query);
  }

  @Post()
  @RequirePermissions('promotions.manage')
  @ApiOperation({ summary: 'Create a shop coupon' })
  create(@Param('shopId') shopId: string, @Body() dto: CreateCouponDto) {
    return this.coupons.create({
      ...dto,
      shopId,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
      validTo: dto.validTo ? new Date(dto.validTo) : undefined,
    });
  }

  @Patch(':couponId')
  @RequirePermissions('promotions.manage')
  update(@Param('shopId') shopId: string, @Param('couponId') couponId: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(couponId, shopId, {
      ...dto,
      validTo: dto.validTo ? new Date(dto.validTo) : undefined,
    });
  }

  @Delete(':couponId')
  @RequirePermissions('promotions.manage')
  @ApiOperation({ summary: 'Deactivate a coupon' })
  deactivate(@Param('shopId') shopId: string, @Param('couponId') couponId: string) {
    return this.coupons.deactivate(couponId, shopId);
  }
}
