import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from './require-permissions.decorator';
import { MembershipsService } from './memberships.service';
import { ChangeMembershipRoleDto, SetMembershipStatusDto } from './dto/rbac.dto';

/**
 * Shop team management (seller.gopasal.com → Team). Viewing needs `team.view`;
 * changing roles / suspending / removing needs `team.invite`.
 * The shop owner's own membership is protected from edits to prevent lockout.
 *
 * Adding a teammate lives at `POST /seller/shops/:shopId/invites`, not here:
 * joining is an act the teammate performs, not something done to them.
 */
@ApiTags('seller:staff')
@ApiBearerAuth()
@Controller('seller/shops/:shopId/staff')
export class StaffController {
  constructor(private readonly memberships: MembershipsService) {}

  /**
   * The whole roster, in one response, on purpose.
   *
   * This route takes no `?page`, `?limit` or `?q`, and that is a decision rather
   * than an omission: see the note on `MembershipsService#listStaff`. In short, a
   * membership exists only because somebody accepted an invitation, and it can be
   * suspended or deleted, so the row count tracks a shopkeeper's staffing choices
   * and not the shop's trading volume. A team screen that has to ask for page 2
   * before it can answer "who has keys to this shop?" is worse, not safer.
   */
  @Get()
  @RequirePermissions('team.view')
  @ApiOperation({ summary: 'List the shop team (complete, unpaginated — see listStaff)' })
  list(@Param('shopId') shopId: string) {
    return this.memberships.listStaff(shopId);
  }

  @Patch(':membershipId/role')
  @RequirePermissions('team.invite')
  changeRole(
    @Param('shopId') shopId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: ChangeMembershipRoleDto,
  ) {
    return this.memberships.changeRole(shopId, membershipId, dto.roleId);
  }

  @Patch(':membershipId/status')
  @RequirePermissions('team.invite')
  setStatus(
    @Param('shopId') shopId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: SetMembershipStatusDto,
  ) {
    return this.memberships.setStatus(shopId, membershipId, dto.status);
  }

  @Delete(':membershipId')
  @RequirePermissions('team.invite')
  remove(@Param('shopId') shopId: string, @Param('membershipId') membershipId: string) {
    return this.memberships.removeStaff(shopId, membershipId);
  }
}
