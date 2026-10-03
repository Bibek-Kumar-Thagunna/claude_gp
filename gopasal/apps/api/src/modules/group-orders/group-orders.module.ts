import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { GroupOrderService } from './group-order.service';
import { GroupOrderController } from './group-order.controller';

/**
 * Group ("order together") orders. OrdersService owns the atomic checkout boundary.
 */
@Module({
  imports: [OrdersModule],
  controllers: [GroupOrderController],
  providers: [GroupOrderService],
  exports: [GroupOrderService],
})
export class GroupOrdersModule {}
