import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DisputeStatus, TicketPriority, TicketStatus } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { SupportService } from './support.service';
import { DisputesService } from './disputes.service';
import {
  ResolveDisputeDto,
  SetTicketPriorityDto,
  SetTicketStatusDto,
  TicketMessageDto,
} from './dto/support.dto';

/**
 * Platform staff view of support + disputes (admin.gopasal.com). Platform-scoped
 * RBAC (no shop context). All mutations are audit-logged.
 */
@ApiTags('admin:support')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/support')
export class SupportAdminController {
  constructor(
    private readonly support: SupportService,
    private readonly disputes: DisputesService,
  ) {}

  // ── Tickets ──────────────────────────────────────────────────────────────
  @Get('tickets')
  @RequirePermissions('support.view')
  listTickets(@Query('status') status?: TicketStatus, @Query('priority') priority?: TicketPriority) {
    return this.support.listAll({ status, priority });
  }

  @Get('tickets/:ticketId')
  @RequirePermissions('support.view')
  getTicket(@Param('ticketId') ticketId: string) {
    return this.support.getAny(ticketId);
  }

  @Post('tickets/:ticketId/reply')
  @RequirePermissions('support.respond')
  @Audit('support.reply', 'SupportTicket', 'ticketId')
  reply(@CurrentUser('id') staffId: string, @Param('ticketId') ticketId: string, @Body() dto: TicketMessageDto) {
    return this.support.staffReply(staffId, ticketId, dto.body, dto.attachments);
  }

  @Patch('tickets/:ticketId/status')
  @RequirePermissions('support.respond')
  @Audit('support.status', 'SupportTicket', 'ticketId')
  setStatus(@Param('ticketId') ticketId: string, @Body() dto: SetTicketStatusDto) {
    return this.support.setStatus(ticketId, dto.status);
  }

  @Patch('tickets/:ticketId/priority')
  @RequirePermissions('support.respond')
  @Audit('support.priority', 'SupportTicket', 'ticketId')
  setPriority(@Param('ticketId') ticketId: string, @Body() dto: SetTicketPriorityDto) {
    return this.support.setPriority(ticketId, dto.priority);
  }

  // ── Disputes ───────────────────────────────────────────────────────────
  @Get('disputes')
  @RequirePermissions('disputes.view')
  listDisputes(@Query('status') status?: DisputeStatus) {
    return this.disputes.listAll(status);
  }

  @Get('disputes/:disputeId')
  @RequirePermissions('disputes.view')
  getDispute(@Param('disputeId') disputeId: string) {
    return this.disputes.get(disputeId);
  }

  @Patch('disputes/:disputeId/review')
  @RequirePermissions('disputes.view')
  @Audit('dispute.review', 'Dispute', 'disputeId')
  review(@Param('disputeId') disputeId: string) {
    return this.disputes.setUnderReview(disputeId);
  }

  @Post('disputes/:disputeId/resolve')
  @RequirePermissions('disputes.resolve')
  @Audit('dispute.resolve', 'Dispute', 'disputeId')
  resolve(@CurrentUser('id') adminId: string, @Param('disputeId') disputeId: string, @Body() dto: ResolveDisputeDto) {
    return this.disputes.resolve(adminId, disputeId, dto);
  }
}
