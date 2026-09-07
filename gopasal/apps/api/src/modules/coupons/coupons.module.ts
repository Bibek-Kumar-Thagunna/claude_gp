import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsSellerController } from './coupons.seller.controller';

@Module({
  controllers: [CouponsSellerController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
