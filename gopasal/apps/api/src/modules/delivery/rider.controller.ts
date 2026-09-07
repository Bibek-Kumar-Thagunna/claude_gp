import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { DeliveryService } from './delivery.service';
import { RiderLocationService } from './rider-location.service';
import { DeliveryStatusDto, RiderPingDto, RiderStatusDto } from './dto/delivery.dto';

/**
 * Rider self-service surface (used by the rider app — deferred, but the API is
 * live). Identity comes from the JWT; the service checks the user is actually a
 * registered rider and only lets them touch their own deliveries.
 *
 * `POST /rider/ping` is the HTTP fallback for GPS when the WebSocket can't
 * connect — same write-path as the socket, just less frequent.
 */
@ApiTags('rider')
@ApiBearerAuth()
@Controller('rider')
export class RiderController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly location: RiderLocationService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'My rider profile + last known location' })
  me(@CurrentUser('id') userId: string) {
    return this.delivery.myRider(userId);
  }

  @Patch('status')
  @ApiOperation({ summary: 'Go online / offline' })
  setStatus(@CurrentUser('id') userId: string, @Body() dto: RiderStatusDto) {
    return this.delivery.setMyStatus(userId, dto.status);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'My active deliveries' })
  deliveries(@CurrentUser('id') userId: string) {
    return this.delivery.myDeliveries(userId);
  }

  @Patch('orders/:orderId/delivery')
  @ApiOperation({ summary: 'Update the status of my delivery' })
  updateStatus(@CurrentUser('id') userId: string, @Param('orderId') orderId: string, @Body() dto: DeliveryStatusDto) {
    return this.delivery.riderUpdateStatus(userId, orderId, dto);
  }

  @Post('ping')
  @ApiOperation({ summary: 'HTTP GPS ping (WebSocket fallback)' })
  async ping(@CurrentUser('id') userId: string, @Body() dto: RiderPingDto) {
    const rider = await this.delivery.myRider(userId);
    return this.location.recordPing(rider.id, dto);
  }
}
