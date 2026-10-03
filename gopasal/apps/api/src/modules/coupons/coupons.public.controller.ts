import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CouponsService } from './coupons.service';

@ApiTags('coupons')
@Controller('shops/:shopSlug/coupons')
export class CouponsPublicController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Active public offers available at a discoverable shop' })
  list(@Param('shopSlug') shopSlug: string) {
    return this.coupons.listPublicOffers(shopSlug);
  }
}
