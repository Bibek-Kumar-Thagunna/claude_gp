import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MessagingService } from './messaging.service';
import { ListConversationsQueryDto, SendShopMessageDto, StartCustomerConversationDto } from './dto/messaging.dto';

@ApiTags('customer:messages')
@ApiBearerAuth()
@Controller('conversations')
export class MessagingCustomerController {
  constructor(private readonly messaging: MessagingService) {}

  @Post()
  @ApiOperation({ summary: 'Start or continue a shop conversation' })
  start(@CurrentUser('id') userId: string, @Body() dto: StartCustomerConversationDto) {
    return this.messaging.startForCustomer(userId, dto);
  }

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: ListConversationsQueryDto) {
    return this.messaging.listForCustomer(userId, query);
  }

  @Get(':conversationId')
  detail(@CurrentUser('id') userId: string, @Param('conversationId') conversationId: string) {
    return this.messaging.detailForCustomer(userId, conversationId);
  }

  @Post(':conversationId/messages')
  send(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendShopMessageDto,
  ) {
    return this.messaging.sendForCustomer(userId, conversationId, dto);
  }

  @Patch(':conversationId/read')
  read(@CurrentUser('id') userId: string, @Param('conversationId') conversationId: string) {
    return this.messaging.markReadForCustomer(userId, conversationId);
  }

  @Patch(':conversationId/close')
  close(@CurrentUser('id') userId: string, @Param('conversationId') conversationId: string) {
    return this.messaging.closeForCustomer(userId, conversationId);
  }
}
