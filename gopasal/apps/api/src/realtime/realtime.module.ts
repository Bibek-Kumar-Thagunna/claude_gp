import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryModule } from '../modules/delivery/delivery.module';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Wires the realtime gateway. AuthModule provides JwtService (handshake auth);
 * DeliveryModule provides RiderLocationService. Prisma/Redis/RBAC are global.
 */
@Module({
  imports: [AuthModule, DeliveryModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
