import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SupportService } from './support.service';
import { DisputesService } from './disputes.service';
import { CreateTicketDto, RaiseDisputeDto, TicketMessageDto } from './dto/support.dto';

/** Customer help centre: support tickets and order disputes for the signed-in user. */
@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly disputes: DisputesService,
  ) {}

  @Post('tickets')
  @ApiOperation({ summary: 'Open a support ticket' })
  createTicket(@CurrentUser('id') userId: string, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(userId, dto);
  }

  @Get('tickets')
  myTickets(@CurrentUser('id') userId: string) {
    return this.support.myTickets(userId);
  }

  @Get('tickets/:ticketId')
  getTicket(@CurrentUser('id') userId: string, @Param('ticketId') ticketId: string) {
    return this.support.getMine(userId, ticketId);
  }

  @Post('tickets/:ticketId/messages')
  @ApiOperation({ summary: 'Reply on my ticket' })
  addMessage(
    @CurrentUser('id') userId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: TicketMessageDto,
  ) {
    return this.support.addMessage(userId, ticketId, dto.body, dto.attachments);
  }

  @Patch('tickets/:ticketId/close')
  closeTicket(@CurrentUser('id') userId: string, @Param('ticketId') ticketId: string) {
    return this.support.closeMine(userId, ticketId);
  }

  // ── Disputes ───────────────────────────────────────────────────────────
  @Post('orders/:orderId/dispute')
  @ApiOperation({ summary: 'Raise a dispute on one of my orders' })
  raiseDispute(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: RaiseDisputeDto,
  ) {
    return this.disputes.raise(userId, orderId, dto);
  }

  @Get('disputes')
  myDisputes(@CurrentUser('id') userId: string) {
    return this.disputes.myDisputes(userId);
  }
}
