import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FraudStatus } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { FraudService } from './fraud.service';
import { RaiseFraudDto, SetFraudStatusDto } from './dto/admin.dto';

/** Fraud triage surface (admin.gopasal.com). */
@ApiTags('admin:fraud')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/fraud')
export class FraudController {
  constructor(private readonly fraud: FraudService) {}

  @Get()
  @RequirePermissions('fraud.view')
  list(@Query('status') status?: FraudStatus, @Query('subjectType') subjectType?: string) {
    return this.fraud.list(status, subjectType);
  }

  @Get(':flagId')
  @RequirePermissions('fraud.view')
  get(@Param('flagId') flagId: string) {
    return this.fraud.get(flagId);
  }

  @Post()
  @RequirePermissions('fraud.manage')
  @Audit('fraud.raise', 'FraudFlag')
  @ApiOperation({ summary: 'Raise a fraud flag on a user, shop or order' })
  raise(@CurrentUser('id') reporterId: string, @Body() dto: RaiseFraudDto) {
    return this.fraud.raise(reporterId, dto);
  }

  @Patch(':flagId/status')
  @RequirePermissions('fraud.manage')
  @Audit('fraud.status', 'FraudFlag', 'flagId')
  setStatus(@Param('flagId') flagId: string, @Body() dto: SetFraudStatusDto) {
    return this.fraud.setStatus(flagId, dto.status);
  }
}
