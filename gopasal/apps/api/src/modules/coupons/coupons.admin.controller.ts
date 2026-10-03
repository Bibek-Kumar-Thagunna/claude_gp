import { Body, Controller, Delete, Get, Param, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupons.dto';
import { CouponsService } from './coupons.service';

@ApiTags('admin:coupons')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/coupons')
export class CouponsAdminController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions('coupons.manage')
  list() {
    return this.coupons.listPlatformCoupons();
  }

  @Post()
  @RequirePermissions('coupons.manage')
  @Audit('coupon.platform.create', 'Coupon')
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create({ ...dto, shopId: null, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined });
  }

  @Patch(':couponId')
  @RequirePermissions('coupons.manage')
  @Audit('coupon.platform.update', 'Coupon', 'couponId')
  update(@Param('couponId') couponId: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.updatePlatform(couponId, { ...dto, validTo: dto.validTo ? new Date(dto.validTo) : undefined });
  }

  @Delete(':couponId')
  @RequirePermissions('coupons.manage')
  @Audit('coupon.platform.deactivate', 'Coupon', 'couponId')
  deactivate(@Param('couponId') couponId: string) {
    return this.coupons.deactivatePlatform(couponId);
  }
}
