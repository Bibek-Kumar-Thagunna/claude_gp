import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';

/** Personalized coupon discovery for a signed-in customer's checkout. */
@ApiTags('customer:coupons')
@ApiBearerAuth()
@Controller('customer/shops/:shopSlug/coupons')
export class CouponsCustomerController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({ summary: 'Active offers this customer can still redeem at a shop' })
  list(@CurrentUser('id') userId: string, @Param('shopSlug') shopSlug: string) {
    return this.coupons.listCustomerOffers(shopSlug, userId);
  }
}
