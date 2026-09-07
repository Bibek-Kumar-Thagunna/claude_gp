import { Body, Controller, Delete, Get, Param, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from './require-permissions.decorator';
import { RolesService } from './roles.service';
import { Audit } from '../modules/audit/audit.decorator';
import { AuditInterceptor } from '../modules/audit/audit.interceptor';
import { CloneRoleDto, CreateRoleDto, UpdateRoleDto } from './dto/rbac.dto';

/**
 * Platform role administration (admin.gopasal.com → Roles & Permissions).
 * PLATFORM-scoped: needs `rbac.platform.manage`. Super Admin is a privileged
 * system role and cannot be edited or deleted. Mutations are audited.
 */
@ApiTags('admin:roles')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/roles')
export class PlatformRolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('catalog')
  @RequirePermissions('rbac.platform.manage')
  @ApiOperation({ summary: 'Grouped platform permission catalogue' })
  catalog() {
    return this.roles.catalog('PLATFORM');
  }

  @Get()
  @RequirePermissions('rbac.platform.manage')
  list() {
    return this.roles.list('PLATFORM');
  }

  @Post()
  @RequirePermissions('rbac.platform.manage')
  @Audit('rbac.role.create', 'Role')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create({
      scope: 'PLATFORM',
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
    });
  }

  @Post(':roleId/clone')
  @RequirePermissions('rbac.platform.manage')
  @Audit('rbac.role.clone', 'Role', 'roleId')
  clone(@Param('roleId') roleId: string, @Body() dto: CloneRoleDto) {
    return this.roles.clone(roleId, { name: dto.name });
  }

  @Patch(':roleId')
  @RequirePermissions('rbac.platform.manage')
  @Audit('rbac.role.update', 'Role', 'roleId')
  update(@Param('roleId') roleId: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(roleId, dto);
  }

  @Delete(':roleId')
  @RequirePermissions('rbac.platform.manage')
  @Audit('rbac.role.delete', 'Role', 'roleId')
  remove(@Param('roleId') roleId: string) {
    return this.roles.remove(roleId);
  }
}
