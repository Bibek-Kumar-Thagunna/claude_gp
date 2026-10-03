import { Controller, Get, Ip, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { DeliveryService } from './delivery.service';
import { DeliveryOrderParamDto, DeliveryShopOrderParamDto } from './dto/delivery.dto';
import { sendDeliveryProof } from './send-delivery-proof';

@ApiTags('delivery:proof')
@ApiBearerAuth()
@Controller()
export class DeliveryProofController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('orders/:orderId/delivery-proof')
  @ApiOperation({ summary: "Open the signed-in customer's delivered-order proof photo" })
  async customer(
    @CurrentUser('id') userId: string,
    @Param() params: DeliveryOrderParamDto,
    @Res() res: Response,
  ): Promise<void> {
    sendDeliveryProof(res, await this.delivery.downloadProofForCustomer(userId, params.orderId));
  }

  @Get('seller/shops/:shopId/orders/:orderId/delivery-proof')
  @RequirePermissions('delivery.view')
  @ApiOperation({ summary: "Open this shop order's private proof photo" })
  async seller(
    @CurrentUser('id') userId: string,
    @Param() params: DeliveryShopOrderParamDto,
    @Res() res: Response,
  ): Promise<void> {
    sendDeliveryProof(
      res,
      await this.delivery.downloadProofForSeller(userId, params.shopId, params.orderId),
    );
  }

  @Get('rider/orders/:orderId/proof')
  @ApiOperation({ summary: "Open the signed-in rider's private proof photo" })
  async rider(
    @CurrentUser('id') userId: string,
    @Param() params: DeliveryOrderParamDto,
    @Res() res: Response,
  ): Promise<void> {
    sendDeliveryProof(res, await this.delivery.downloadProofForRider(userId, params.orderId));
  }

  @Get('admin/orders/:orderId/delivery-proof')
  @RequirePermissions('disputes.view')
  @ApiOperation({ summary: 'Open a private delivery proof for evidence review' })
  async admin(
    @CurrentUser('id') userId: string,
    @Param() params: DeliveryOrderParamDto,
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    sendDeliveryProof(
      res,
      await this.delivery.downloadProofForAdmin(userId, params.orderId, ip),
    );
  }
}
