import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsSellerController } from './coupons.seller.controller';
import { CouponsPublicController } from './coupons.public.controller';
import { CouponsAdminController } from './coupons.admin.controller';
import { CouponsCustomerController } from './coupons.customer.controller';

@Module({
  controllers: [
    CouponsSellerController,
    CouponsPublicController,
    CouponsCustomerController,
    CouponsAdminController,
  ],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
