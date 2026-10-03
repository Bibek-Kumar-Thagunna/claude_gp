import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile as FilePart,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MULTIPART_HARD_LIMIT_BYTES } from '../../config/configuration';
import type { UploadedFile } from '../uploads/uploaded-file';
import { DeliveryService } from './delivery.service';
import { RiderLocationService } from './rider-location.service';
import {
  DeliveryOrderParamDto,
  DeliveryStatusDto,
  RiderDeliveryHistoryQueryDto,
  RiderPingDto,
  RiderStatusDto,
} from './dto/delivery.dto';

/**
 * Rider self-service surface used by the dedicated rider web console and future
 * native app. Identity comes from the JWT; the service checks the user is actually a
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

  @Get('deliveries/history')
  @ApiOperation({ summary: 'My completed and failed delivery history' })
  history(@CurrentUser('id') userId: string, @Query() query: RiderDeliveryHistoryQueryDto) {
    return this.delivery.myDeliveryHistory(userId, query);
  }

  @Patch('orders/:orderId/delivery')
  @ApiOperation({ summary: 'Update the status of my delivery' })
  updateStatus(
    @CurrentUser('id') userId: string,
    @Param() params: DeliveryOrderParamDto,
    @Body() dto: DeliveryStatusDto,
  ) {
    return this.delivery.riderUpdateStatus(userId, params.orderId, dto);
  }

  @Post('orders/:orderId/proof')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Securely attach a private proof-of-delivery photo',
    description:
      'JPEG, PNG or WebP only. The object is stored privately and the storage key is never returned to the browser.',
  })
  uploadProof(
    @CurrentUser('id') userId: string,
    @Param() params: DeliveryOrderParamDto,
    @FilePart() file: UploadedFile | undefined,
  ) {
    return this.delivery.uploadMyProof(userId, params.orderId, file);
  }

  @Post('ping')
  @ApiOperation({ summary: 'HTTP GPS ping (WebSocket fallback)' })
  async ping(@CurrentUser('id') userId: string, @Body() dto: RiderPingDto) {
    const rider = await this.delivery.myRider(userId);
    return this.location.recordPing(rider.id, dto);
  }
}
