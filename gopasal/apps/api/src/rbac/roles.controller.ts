import { Body, Controller, Delete, Get, Param, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from './require-permissions.decorator';
import { RolesService } from './roles.service';
import { Audit } from '../modules/audit/audit.decorator';
import { AuditInterceptor } from '../modules/audit/audit.interceptor';
import { CloneRoleDto, CreateRoleDto, UpdateRoleDto } from './dto/rbac.dto';

/**
 * Shop role administration (seller.gopasal.com → Team & Roles).
 * Every route is SHOP-scoped: the `:shopId` param supplies the RBAC context, so
 * an owner or a teammate holding `rbac.manage` for THIS shop can manage its roles.
 * System roles are read-only templates; clone one to customise it.
 *
 * Mutations are audited. A shop's own team must be able to answer "who changed
 * what access, and when" without asking the platform for a database query.
 */
@ApiTags('seller:roles')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('seller/shops/:shopId/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('catalog')
  @RequirePermissions('rbac.manage')
  @ApiOperation({ summary: 'Grouped permission catalogue for the role editor' })
  catalog() {
    return this.roles.catalog('SHOP');
  }

  @Get()
  @RequirePermissions('rbac.manage')
  @ApiOperation({ summary: "This shop's roles plus system templates" })
  list(@Param('shopId') shopId: string) {
    return this.roles.list('SHOP', shopId);
  }

  @Post()
  @RequirePermissions('rbac.manage')
  @Audit('shop.role.create', 'Role')
  create(@Param('shopId') shopId: string, @Body() dto: CreateRoleDto) {
    return this.roles.create({
      scope: 'SHOP',
      shopId,
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
    });
  }

  @Post(':roleId/clone')
  @RequirePermissions('rbac.manage')
  @Audit('shop.role.clone', 'Role', 'roleId')
  @ApiOperation({ summary: 'Clone a system template into an editable shop role' })
  clone(@Param('shopId') shopId: string, @Param('roleId') roleId: string, @Body() dto: CloneRoleDto) {
    return this.roles.clone(roleId, { name: dto.name, shopId });
  }

  @Patch(':roleId')
  @RequirePermissions('rbac.manage')
  @Audit('shop.role.update', 'Role', 'roleId')
  update(
    @Param('shopId') shopId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    // shopId is passed as the tenancy scope, not just for RBAC context: without
    // it a `rbac.manage` holder could rewrite another shop's custom role.
    return this.roles.update(roleId, dto, shopId);
  }

  @Delete(':roleId')
  @RequirePermissions('rbac.manage')
  @Audit('shop.role.delete', 'Role', 'roleId')
  remove(@Param('shopId') shopId: string, @Param('roleId') roleId: string) {
    return this.roles.remove(roleId, shopId);
  }
}
