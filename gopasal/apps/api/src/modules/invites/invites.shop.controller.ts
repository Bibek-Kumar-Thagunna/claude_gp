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
 * Shop team invitations (seller.gopasal.com → Team → Invite).
 *
 * This is the answer to "how do staff get their accounts": the owner names a
 * phone number and a role, GoPasal texts that number a link and a code, and the
 * teammate signs in with their own OTP. The owner never sets, sees or transmits
 * a password, because there isn't one.
 */
@ApiTags('seller:invites')
@ApiBearerAuth()
@Controller('seller/shops/:shopId/invites')
@UseInterceptors(AuditInterceptor)
export class ShopInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @RequirePermissions('team.view')
  @ApiOperation({ summary: 'List invitations for this shop' })
  list(@Param('shopId') shopId: string, @Query() query: InviteListQueryDto) {
    return this.invites.list({ scope: 'SHOP', shopId }, query.status ?? 'PENDING');
  }

  @Post()
  @RequirePermissions('team.invite')
  @Audit('shop.invite.create', 'StaffInvite')
  @ApiOperation({
    summary: 'Invite a teammate by phone',
    description:
      'Returns the join link and one-time code once, so the owner can also pass them on in person. They are not recoverable afterwards.',
  })
  create(
    @Param('shopId') shopId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invites.create({ scope: 'SHOP', shopId }, dto, user.id);
  }

  @Post(':inviteId/resend')
  @RequirePermissions('team.invite')
  @Audit('shop.invite.resend', 'StaffInvite', 'inviteId')
  @ApiOperation({ summary: 'Resend an invitation (issues a fresh link and code)' })
  resend(@Param('shopId') shopId: string, @Param('inviteId') inviteId: string) {
    return this.invites.resend({ scope: 'SHOP', shopId }, inviteId);
  }

  @Delete(':inviteId')
  @RequirePermissions('team.invite')
  @Audit('shop.invite.revoke', 'StaffInvite', 'inviteId')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revoke(@Param('shopId') shopId: string, @Param('inviteId') inviteId: string) {
    return this.invites.revoke({ scope: 'SHOP', shopId }, inviteId);
  }
}
