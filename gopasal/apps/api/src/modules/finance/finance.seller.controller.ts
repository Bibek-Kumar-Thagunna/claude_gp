import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { FinanceService } from './finance.service';

@ApiTags('seller:finance')
@ApiBearerAuth()
@Controller('seller/shops/:shopId/finance')
export class FinanceSellerController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Seller escrow, COD commission, refunds and settlements' })
  get(@Param('shopId') shopId: string) {
    return this.finance.forShop(shopId);
  }
}
