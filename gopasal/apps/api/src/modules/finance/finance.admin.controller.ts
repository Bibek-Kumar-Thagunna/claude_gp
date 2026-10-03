import { Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { RefundStatus } from '@prisma/client';
import { CompleteRefundDto, CompleteSettlementDto, IssueRefundDto } from './dto/finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('admin:finance')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/finance')
export class FinanceAdminController {
  constructor(private readonly finance: FinanceService) {}

  @Get('overview')
  @RequirePermissions('finance.platform.view')
  overview() {
    return this.finance.overview();
  }

  @Get('settlements')
  @RequirePermissions('finance.platform.view')
  settlements(@Query('shopId') shopId?: string) {
    return this.finance.listSettlements(shopId);
  }

  @Get('ledger')
  @RequirePermissions('finance.platform.view')
  ledger(@Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number) {
    return this.finance.ledger(limit);
  }

  @Get('refunds')
  @RequirePermissions('finance.platform.view')
  refunds(@Query('status', new ParseEnumPipe(RefundStatus, { optional: true })) status?: RefundStatus) {
    return this.finance.listRefunds(status);
  }

  @Post('reconcile')
  @RequirePermissions('finance.manage')
  @Audit('finance.reconcile', 'Finance')
  @ApiOperation({ summary: 'Release eligible escrow and create deterministic seller settlement batches' })
  reconcile(@CurrentUser('id') actorId: string) {
    return this.finance.reconcile(actorId);
  }

  @Post('settlements/:settlementId/complete')
  @RequirePermissions('finance.manage')
  @Audit('settlement.complete', 'Settlement', 'settlementId')
  complete(
    @CurrentUser('id') actorId: string,
    @Param('settlementId') settlementId: string,
    @Body() dto: CompleteSettlementDto,
  ) {
    return this.finance.completeSettlement(actorId, settlementId, dto);
  }

  @Post('orders/:orderId/refunds')
  @RequirePermissions('finance.manage')
  @Audit('refund.issue', 'Order', 'orderId')
  refund(
    @CurrentUser('id') actorId: string,
    @Param('orderId') orderId: string,
    @Body() dto: IssueRefundDto,
  ) {
    return this.finance.issueRefund(actorId, orderId, dto);
  }

  @Post('refunds/:refundId/complete')
  @RequirePermissions('finance.manage')
  @Audit('refund.complete', 'Refund', 'refundId')
  completeRefund(
    @CurrentUser('id') actorId: string,
    @Param('refundId') refundId: string,
    @Body() dto: CompleteRefundDto,
  ) {
    return this.finance.completeRefund(actorId, refundId, dto);
  }

  @Post('refunds/:refundId/process')
  @RequirePermissions('finance.manage')
  @Audit('refund.process', 'Refund', 'refundId')
  processRefund(
    @CurrentUser('id') actorId: string,
    @Param('refundId') refundId: string,
  ) {
    return this.finance.processRefund(refundId, actorId);
  }
}
