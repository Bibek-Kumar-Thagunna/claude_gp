import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { GroupOrderService } from './group-order.service';
import { GroupOrderController } from './group-order.controller';

/**
 * Group ("order together") orders. Reuses CartService + OrdersService so the
 * combined order goes through the exact same checkout path as a solo order.
 */
@Module({
  imports: [CartModule, OrdersModule],
  controllers: [GroupOrderController],
  providers: [GroupOrderService],
  exports: [GroupOrderService],
})
export class GroupOrdersModule {}
