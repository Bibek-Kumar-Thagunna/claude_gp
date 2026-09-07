import { Body, Controller, Delete, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { CreateInviteDto, InviteListQueryDto } from './dto/invites.dto';
import { InvitesService } from './invites.service';

/**
 * Platform staff invitations (admin.gopasal.com → Staff).
 *
 * Same mechanism as shop invites, one deliberate difference: the Super Admin
 * role is not invitable. Handing out privileged platform access by SMS link is
 * exactly the escalation path RBAC is supposed to close, so that role is
 * provisioned out of band (seed or migration) only.
 */
@ApiTags('admin:invites')
@ApiBearerAuth()
@Controller('admin/staff/invites')
@UseInterceptors(AuditInterceptor)
export class PlatformInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @RequirePermissions('rbac.platform.manage')
  @ApiOperation({ summary: 'List platform staff invitations' })
  list(@Query() query: InviteListQueryDto) {
    return this.invites.list({ scope: 'PLATFORM' }, query.status ?? 'PENDING');
  }

  @Post()
  @RequirePermissions('rbac.platform.manage')
  @Audit('platform.invite.create', 'StaffInvite')
  @ApiOperation({ summary: 'Invite a colleague to the admin console' })
  create(@Body() dto: CreateInviteDto, @CurrentUser() user: AuthUser) {
    return this.invites.create({ scope: 'PLATFORM' }, dto, user.id);
  }

  @Post(':inviteId/resend')
  @RequirePermissions('rbac.platform.manage')
  @Audit('platform.invite.resend', 'StaffInvite', 'inviteId')
  resend(@Param('inviteId') inviteId: string) {
    return this.invites.resend({ scope: 'PLATFORM' }, inviteId);
  }

  @Delete(':inviteId')
  @RequirePermissions('rbac.platform.manage')
  @Audit('platform.invite.revoke', 'StaffInvite', 'inviteId')
  revoke(@Param('inviteId') inviteId: string) {
    return this.invites.revoke({ scope: 'PLATFORM' }, inviteId);
  }
}
