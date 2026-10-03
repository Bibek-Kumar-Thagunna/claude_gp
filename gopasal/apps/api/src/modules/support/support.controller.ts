import { Body, Controller, Get, Param, Patch, Post, Res, UploadedFile as FilePart, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MULTIPART_HARD_LIMIT_BYTES } from '../../config/configuration';
import { sendDocument } from '../onboarding/send-document';
import type { UploadedFile } from '../uploads/uploaded-file';
import { SupportService } from './support.service';
import { DisputesService } from './disputes.service';
import { SupportAssistantService } from './support-assistant.service';
import {
  AskSupportAssistantDto,
  CreateTicketDto,
  EscalateSupportAssistantDto,
  RaiseDisputeDto,
  TicketMessageDto,
} from './dto/support.dto';

/** Customer help centre: support tickets and order disputes for the signed-in user. */
@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly disputes: DisputesService,
    private readonly assistant: SupportAssistantService,
  ) {}

  @Get('assistant/knowledge')
  @ApiOperation({ summary: 'List the approved support knowledge available to the assistant' })
  assistantKnowledge() {
    return this.assistant.knowledge();
  }

  @Get('assistant/sessions/current')
  currentAssistantSession(@CurrentUser('id') userId: string) {
    return this.assistant.current(userId);
  }

  @Get('assistant/sessions/:sessionId')
  assistantSession(@CurrentUser('id') userId: string, @Param('sessionId') sessionId: string) {
    return this.assistant.get(userId, sessionId);
  }

  @Post('assistant/messages')
  @ApiOperation({ summary: 'Ask the source-grounded GoPasal support assistant' })
  askAssistant(@CurrentUser('id') userId: string, @Body() dto: AskSupportAssistantDto) {
    return this.assistant.ask(userId, dto);
  }

  @Post('assistant/sessions/:sessionId/escalate')
  @ApiOperation({ summary: 'Hand an assistant conversation to human support' })
  escalateAssistant(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: EscalateSupportAssistantDto,
  ) {
    return this.assistant.escalate(userId, sessionId, dto.subject, dto.reason);
  }

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
    return this.support.addMessage(userId, ticketId, dto.body);
  }

  @Post('tickets/:ticketId/messages/with-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['body', 'file'], properties: { body: { type: 'string' }, file: { type: 'string', format: 'binary' } } } })
  addMessageWithFile(
    @CurrentUser('id') userId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: TicketMessageDto,
    @FilePart() file: UploadedFile | undefined,
  ) {
    return this.support.addMessageWithFile(userId, ticketId, dto.body, file);
  }

  @Get('tickets/:ticketId/files/:attachmentId')
  async downloadFile(
    @CurrentUser('id') userId: string,
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    sendDocument(res, await this.support.customerAttachment(userId, ticketId, attachmentId));
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
