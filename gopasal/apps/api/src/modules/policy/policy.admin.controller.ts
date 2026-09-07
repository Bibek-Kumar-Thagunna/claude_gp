import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { PolicyService } from './policy.service';
import { CreatePolicyDto, UpdatePolicyDto } from './dto/policy.dto';

/** Platform policy management (admin.gopasal.com). Drafting + publishing versions. */
@ApiTags('admin:policies')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/policies')
export class PolicyAdminController {
  constructor(private readonly policy: PolicyService) {}

  @Get()
  @RequirePermissions('policy.view')
  list(@Query('key') key?: string) {
    return this.policy.listAll(key);
  }

  @Get(':policyId')
  @RequirePermissions('policy.view')
  get(@Param('policyId') policyId: string) {
    return this.policy.getById(policyId);
  }

  @Post()
  @RequirePermissions('policy.publish')
  @Audit('policy.create', 'PolicyDocument')
  create(@Body() dto: CreatePolicyDto) {
    return this.policy.create(dto);
  }

  @Patch(':policyId')
  @RequirePermissions('policy.publish')
  @Audit('policy.update', 'PolicyDocument', 'policyId')
  update(@Param('policyId') policyId: string, @Body() dto: UpdatePolicyDto) {
    return this.policy.update(policyId, dto);
  }

  @Post(':policyId/publish')
  @RequirePermissions('policy.publish')
  @Audit('policy.publish', 'PolicyDocument', 'policyId')
  @ApiOperation({ summary: 'Publish a draft version (becomes the current policy)' })
  publish(@Param('policyId') policyId: string) {
    return this.policy.publish(policyId);
  }
}
