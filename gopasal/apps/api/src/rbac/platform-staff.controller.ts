import { Body, Controller, Delete, Get, Param, Patch, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from './require-permissions.decorator';
import { MembershipsService } from './memberships.service';
import { Audit } from '../modules/audit/audit.decorator';
import { AuditInterceptor } from '../modules/audit/audit.interceptor';
import { AssignPlatformStaffDto } from './dto/rbac.dto';

/**
 * Platform staff management (admin.gopasal.com → Staff). PLATFORM-scoped, needs
 * `rbac.platform.manage`. Super Admins are protected from edits and removal
 * here. New colleagues are *invited* (`POST /admin/staff/invites`) rather than
 * assigned directly — this surface only changes the role of someone who already
 * accepted an invitation.
 */
@ApiTags('admin:staff')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/staff')
export class PlatformStaffController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @RequirePermissions('rbac.platform.manage')
  @ApiOperation({ summary: 'List platform staff and their roles' })
  list() {
    return this.memberships.listPlatformStaff();
  }

  @Patch('role')
  @RequirePermissions('rbac.platform.manage')
  @Audit('rbac.platform-staff.role', 'PlatformMembership')
  @ApiOperation({
    summary: 'Change an existing staff member’s platform role',
    description: 'Refuses unknown numbers — invite them instead so they are actually told.',
  })
  changeRole(@Body() dto: AssignPlatformStaffDto) {
    return this.memberships.assignPlatform(dto.phone, dto.roleId);
  }

  @Delete(':userId')
  @RequirePermissions('rbac.platform.manage')
  @Audit('rbac.platform-staff.remove', 'PlatformMembership', 'userId')
  remove(@Param('userId') userId: string) {
    return this.memberships.removePlatform(userId);
  }
}
