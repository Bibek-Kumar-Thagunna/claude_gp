import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { UploadsModule } from '../uploads/uploads.module';
import { DeliveryService } from './delivery.service';
import { RiderLocationService } from './rider-location.service';
import { DeliverySellerController } from './delivery.seller.controller';
import { RiderController } from './rider.controller';
import { DeliveryProofController } from './delivery-proof.controller';

@Module({
  imports: [OrdersModule, UploadsModule],
  controllers: [DeliverySellerController, RiderController, DeliveryProofController],
  providers: [DeliveryService, RiderLocationService],
  exports: [DeliveryService, RiderLocationService],
})
export class DeliveryModule {}
