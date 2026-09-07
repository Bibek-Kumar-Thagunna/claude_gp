import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';
import { RolesService } from './roles.service';
import { MembershipsService } from './memberships.service';
import { RolesController } from './roles.controller';
import { StaffController } from './staff.controller';
import { PlatformRolesController } from './platform-roles.controller';
import { PlatformStaffController } from './platform-staff.controller';

/**
 * Global RBAC engine. Exports the resolver (RbacService), the role admin
 * (RolesService), staff/membership admin (MembershipsService) and the guard so
 * any module can apply @RequirePermissions.
 *
 * HTTP surface:
 *  - seller/shops/:shopId/roles  → RolesController        (rbac.manage)
 *  - seller/shops/:shopId/staff  → StaffController        (team.view / team.invite)
 *  - admin/roles                 → PlatformRolesController (rbac.platform.manage)
 *  - admin/staff                 → PlatformStaffController (rbac.platform.manage)
 */
@Global()
@Module({
  controllers: [
    RolesController,
    StaffController,
    PlatformRolesController,
    PlatformStaffController,
  ],
  providers: [RbacService, RolesService, MembershipsService, PermissionsGuard],
  exports: [RbacService, RolesService, MembershipsService, PermissionsGuard],
})
export class RbacModule {}
