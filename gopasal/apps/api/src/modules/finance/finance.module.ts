import { Module } from '@nestjs/common';
import { FinanceAdminController } from './finance.admin.controller';
import { FinanceSellerController } from './finance.seller.controller';
import { FinanceService } from './finance.service';

@Module({
  controllers: [FinanceAdminController, FinanceSellerController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
