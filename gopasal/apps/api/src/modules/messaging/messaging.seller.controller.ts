import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { ListConversationsQueryDto, SendShopMessageDto, StartOrderConversationDto } from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@ApiTags('seller:messages')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('seller/shops/:shopId/conversations')
export class MessagingSellerController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @RequirePermissions('messages.view')
  list(@Param('shopId') shopId: string, @Query() query: ListConversationsQueryDto) {
    return this.messaging.listForShop(shopId, query);
  }

  @Get(':conversationId')
  @RequirePermissions('messages.view')
  detail(@Param('shopId') shopId: string, @Param('conversationId') conversationId: string) {
    return this.messaging.detailForShop(shopId, conversationId);
  }

  @Post('orders/start')
  @RequirePermissions('messages.respond')
  @Audit('shop.conversation.order.start', 'ShopConversation')
  @ApiOperation({ summary: 'Start an order-linked customer conversation' })
  startOrder(
    @Param('shopId') shopId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: StartOrderConversationDto,
  ) {
    return this.messaging.startForShopOrder(shopId, userId, dto);
  }

  @Post(':conversationId/messages')
  @RequirePermissions('messages.respond')
  @Audit('shop.conversation.reply', 'ShopConversation', 'conversationId')
  send(
    @Param('shopId') shopId: string,
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendShopMessageDto,
  ) {
    return this.messaging.sendForShop(shopId, userId, conversationId, dto);
  }

  @Patch(':conversationId/read')
  @RequirePermissions('messages.view')
  read(@Param('shopId') shopId: string, @Param('conversationId') conversationId: string) {
    return this.messaging.markReadForShop(shopId, conversationId);
  }

  @Patch(':conversationId/close')
  @RequirePermissions('messages.respond')
  @Audit('shop.conversation.close', 'ShopConversation', 'conversationId')
  close(@Param('shopId') shopId: string, @Param('conversationId') conversationId: string) {
    return this.messaging.closeForShop(shopId, conversationId);
  }
}
