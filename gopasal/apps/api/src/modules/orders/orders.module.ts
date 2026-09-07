import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CouponsModule } from '../coupons/coupons.module';
import { OrdersController } from './orders.controller';
import { OrdersSellerController } from './orders.seller.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, CouponsModule],
  controllers: [OrdersController, OrdersSellerController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
