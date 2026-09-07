import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { OrdersService } from './orders.service';
import { ListShopOrdersQueryDto, RejectOrderDto, TransitionNoteDto } from './dto/orders.dto';

/**
 * Seller order management, shop-scoped. Every route carries `:shopId` so the
 * PermissionsGuard resolves the shop and checks the membership's permissions.
 */
@ApiTags('seller:orders')
@ApiBearerAuth()
@Controller('seller/shops/:shopId/orders')
export class OrdersSellerController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders.view')
  @ApiOperation({
    summary: 'Order queue — paged, searchable, filterable by one or more statuses',
    description:
      'Returns `{ data, meta, summary }`. `meta` describes the page; `summary` counts the ' +
      'whole shop queue and is unaffected by `status`/`q`, so the console can filter the ' +
      'list without the stat cards changing meaning.',
  })
  list(@Param('shopId') shopId: string, @Query() query: ListShopOrdersQueryDto) {
    return this.orders.listForShop(shopId, query);
  }

  @Get(':orderId')
  @RequirePermissions('orders.view')
  get(@Param('shopId') shopId: string, @Param('orderId') orderId: string) {
    return this.orders.getForShop(shopId, orderId);
  }

  @Post(':orderId/accept')
  @RequirePermissions('orders.accept')
  accept(@Param('shopId') shopId: string, @Param('orderId') orderId: string, @Body() dto: TransitionNoteDto) {
    return this.orders.accept(shopId, orderId, dto.note);
  }

  @Post(':orderId/reject')
  @RequirePermissions('orders.reject')
  reject(@Param('shopId') shopId: string, @Param('orderId') orderId: string, @Body() dto: RejectOrderDto) {
    return this.orders.reject(shopId, orderId, dto.reason);
  }

  @Post(':orderId/pack')
  @RequirePermissions('orders.pack')
  pack(@Param('shopId') shopId: string, @Param('orderId') orderId: string, @Body() dto: TransitionNoteDto) {
    return this.orders.pack(shopId, orderId, dto.note);
  }

  @Post(':orderId/dispatch')
  @RequirePermissions('orders.dispatch')
  @ApiOperation({ summary: 'Send out for delivery (a rider must be assigned first)' })
  dispatch(@Param('shopId') shopId: string, @Param('orderId') orderId: string, @Body() dto: TransitionNoteDto) {
    return this.orders.dispatch(shopId, orderId, dto.note);
  }

  @Post(':orderId/cancel')
  @RequirePermissions('orders.cancel')
  cancel(@Param('shopId') shopId: string, @Param('orderId') orderId: string, @Body() dto: TransitionNoteDto) {
    return this.orders.cancelForShop(shopId, orderId, dto.note);
  }
}
