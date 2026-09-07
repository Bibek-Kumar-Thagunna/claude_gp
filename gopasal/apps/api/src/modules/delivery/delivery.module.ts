import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryService } from './delivery.service';
import { RiderLocationService } from './rider-location.service';
import { DeliverySellerController } from './delivery.seller.controller';
import { RiderController } from './rider.controller';

@Module({
  imports: [OrdersModule],
  controllers: [DeliverySellerController, RiderController],
  providers: [DeliveryService, RiderLocationService],
  exports: [DeliveryService, RiderLocationService],
})
export class DeliveryModule {}
