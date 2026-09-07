import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { ApplyCouponDto, CancelOrderDto, CheckoutDto } from './dto/orders.dto';

/** Customer order surface — place, track, cancel. Bound to the signed-in user. */
@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Place an order from the current cart' })
  checkout(@CurrentUser('id') userId: string, @Body() dto: CheckoutDto) {
    return this.orders.checkout(userId, dto);
  }

  @Post('preview-coupon')
  @ApiOperation({ summary: 'Preview a coupon discount against the current cart' })
  previewCoupon(@CurrentUser('id') userId: string, @Body() dto: ApplyCouponDto) {
    return this.orders.previewCoupon(userId, dto.couponCode);
  }

  @Get()
  @ApiOperation({ summary: 'My order history' })
  list(@CurrentUser('id') userId: string) {
    return this.orders.listMine(userId);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Order detail incl. live tracking payload' })
  get(@CurrentUser('id') userId: string, @Param('orderId') orderId: string) {
    return this.orders.getMine(userId, orderId);
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel an order (only before it is dispatched)' })
  cancel(@CurrentUser('id') userId: string, @Param('orderId') orderId: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelMine(userId, orderId, dto.reason);
  }
}
