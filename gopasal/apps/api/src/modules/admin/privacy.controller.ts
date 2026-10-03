import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { PlaceLegalHoldDto, ReleaseLegalHoldDto, UpdateRetentionPolicyDto } from './dto/privacy.dto';
import { PrivacyService } from './privacy.service';

@ApiTags('admin:privacy')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  @RequirePermissions('privacy.view')
  @ApiOperation({ summary: 'Retention policy, erasure lifecycle, legal holds and recent runs' })
  overview() {
    return this.privacy.overview();
  }

  @Patch('policy')
  @RequirePermissions('privacy.manage')
  @Audit('privacy.policy_update', 'RetentionPolicy')
  updatePolicy(@CurrentUser('id') actorId: string, @Body() dto: UpdateRetentionPolicyDto) {
    return this.privacy.updatePolicy(actorId, dto.days, dto.legalBasis);
  }

  @Post('holds')
  @RequirePermissions('privacy.manage')
  @Audit('privacy.hold_place', 'LegalHold')
  placeHold(@CurrentUser('id') actorId: string, @Body() dto: PlaceLegalHoldDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('Expiry must be in the future');
    return this.privacy.placeHold(actorId, dto.userId, dto.reason, expiresAt);
  }

  @Post('holds/:holdId/release')
  @RequirePermissions('privacy.manage')
  @Audit('privacy.hold_release', 'LegalHold', 'holdId')
  releaseHold(@CurrentUser('id') actorId: string, @Param('holdId') holdId: string, @Body() dto: ReleaseLegalHoldDto) {
    return this.privacy.releaseHold(actorId, holdId, dto.reason);
  }

  @Post('runs')
  @RequirePermissions('privacy.manage')
  @Audit('privacy.retention_run', 'RetentionRun')
  @ApiOperation({ summary: 'Run one bounded batch of due retention redactions' })
  run(@CurrentUser('id') actorId: string) {
    return this.privacy.run('MANUAL', actorId);
  }
}
